import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openDatabase } from '../server/sqlite.js';
import { createApp } from '../server/node.js';
import { addUser } from '../src/auth.js';
import { schemaSql } from '../src/schema.js';
import { dashboard } from '../src/core.js';
import { digest } from '../src/notify.js';
import { parseCsv, importRows } from '../scripts/import.js';
import { today, addDays } from '../src/time.js';

const outbox = [];
const env = {
  DB: openDatabase(':memory:'),
  TELEGRAM_BOT_TOKEN: 'test-bot',
  fetch: async (url, options) => {
    outbox.push(JSON.parse(options.body));
    return { ok: true };
  },
};
let server;
let base;
const keys = {};

before(async () => {
  keys.anna = await addUser(env.DB, { login: 'anna', name: 'Anna', role: 'CEO', telegram: '111' });
  keys.boris = await addUser(env.DB, { login: 'boris', name: 'Boris', role: 'COO', telegram: '222' });
  server = createApp(env);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  env.DB.close();
});

async function call(path, { user = 'anna', method = 'GET', body } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: { ...(user && { authorization: `Bearer ${keys[user]}` }), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const isJson = response.headers.get('content-type')?.includes('json');
  return { status: response.status, data: isJson ? JSON.parse(text) : text, headers: response.headers };
}

const rpc = async (url, method, params, id = 1) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  return response.json();
};

test('the committed migration matches the schema', () => {
  const file = readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8');
  assert.equal(file.replaceAll('\r\n', '\n'), schemaSql());
});

test('a key is required and only its hash is stored', async () => {
  assert.equal((await call('/api/tasks', { user: null })).status, 401);
  const row = await env.DB.prepare("SELECT * FROM users WHERE login = 'anna'").first();
  assert.ok(!Object.values(row).includes(keys.anna));
});

test('create, change, filter and archive a task', async () => {
  const created = await call('/api/tasks', { method: 'POST', body: { title: 'Позвонить клиенту', owner: 'boris', due: '2026-01-10' } });
  assert.equal(created.status, 201);
  assert.equal(created.data.status, 'План');
  assert.equal(outbox.at(-1).chat_id, '222', 'the new owner is notified');

  const changed = await call(`/api/tasks/${created.data.id}`, { user: 'boris', method: 'PATCH', body: { status: 'Заблокировано', note: 'Нет номера' } });
  assert.equal(changed.data.updated_by, 'boris');
  assert.equal(outbox.at(-1).chat_id, '111', 'teammates hear about blockers');

  const found = await call(`/api/tasks?owner=boris&open=1&q=${encodeURIComponent('позвонить')}`);
  assert.equal(found.data.length, 1);

  assert.equal((await call(`/api/tasks/${created.data.id}`, { method: 'DELETE' })).status, 204);
  assert.equal((await call('/api/tasks')).data.length, 0);
  const kept = await env.DB.prepare('SELECT archived FROM tasks WHERE id = ?').bind(created.data.id).first();
  assert.equal(kept.archived, 1);
});

test('wrong input is rejected with a reason', async () => {
  for (const body of [
    {}, { title: 'x', status: 'Done' }, { title: 'x', owner: 'ghost' }, { title: 'x', due: '2026-02-30' },
    { title: 'x', archived: 1 }, { title: 'a'.repeat(501) },
  ]) {
    const result = await call('/api/tasks', { method: 'POST', body });
    assert.equal(result.status, 400, JSON.stringify(body).slice(0, 80));
    assert.ok(result.data.error);
  }
  assert.equal((await call('/api/content', { method: 'POST', body: { title: 'x', url: 'javascript:alert(1)' } })).status, 400);
  assert.equal((await call('/api/users')).status, 404);
});

test('one report per person per day', async () => {
  await call('/api/reports', { method: 'POST', body: { done: 'Первое' } });
  await call('/api/reports', { method: 'POST', body: { numbers: '5 звонков' } });
  const reports = (await call('/api/reports?owner=anna')).data;
  assert.equal(reports.length, 1);
  assert.equal(reports[0].done, 'Первое');
  assert.equal(reports[0].numbers, '5 звонков');
});

test('the dashboard shows what needs attention', async () => {
  const day = today({});
  await call('/api/tasks', { method: 'POST', body: { title: 'Старая', owner: 'anna', due: addDays(day, -2) } });
  await call('/api/leads', { method: 'POST', body: { company: 'North School', owner: 'anna', next_date: day } });
  const { data } = await call('/api/dashboard');
  assert.equal(data.tasks.overdue.length, 1);
  assert.equal(data.leads_due.length, 1);
  assert.deepEqual(data.reports, { submitted: ['anna'], missing: ['boris'] });
});

test('digests go to the right people', async () => {
  outbox.length = 0;
  assert.equal(await digest({ db: env.DB, env }, 'evening', dashboard), 1);
  assert.equal(outbox[0].chat_id, '222');
  outbox.length = 0;
  assert.equal(await digest({ db: env.DB, env }, 'morning', dashboard), 2);
  assert.match(outbox[0].text, /Просрочено/);
});

test('Claude can connect, read and update', async () => {
  const me = (await call('/api/me')).data;
  assert.ok(!me.claude_url.includes(keys.anna), 'the sign-in key is not part of the connector address');

  const init = await rpc(me.claude_url, 'initialize', { protocolVersion: '2025-06-18' });
  assert.equal(init.result.protocolVersion, '2025-06-18');
  const tools = (await rpc(me.claude_url, 'tools/list')).result.tools.map((t) => t.name);
  assert.ok(tools.includes('my_day') && tools.includes('update_item'));
  assert.ok(!tools.some((name) => /delete|archive/.test(name)));

  const added = await rpc(me.claude_url, 'tools/call', { name: 'add_item', arguments: { table: 'ideas', fields: { title: 'Новая идея' } } });
  const idea = JSON.parse(added.result.content[0].text);
  assert.equal(idea.updated_by, 'anna');
  const bad = await rpc(me.claude_url, 'tools/call', { name: 'update_item', arguments: { table: 'ideas', id: idea.id, fields: { status: '?' } } });
  assert.equal(bad.result.isError, true);

  const notification = await fetch(me.claude_url, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) });
  assert.equal(notification.status, 202);
  assert.equal((await fetch(me.claude_url)).status, 405);
  assert.equal((await fetch(`${base}/mcp/anna/wrong-key`, { method: 'POST', body: '{}' })).status, 401);

  const header = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { authorization: `Bearer ${keys.boris}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'ping' }),
  });
  assert.equal(header.status, 200);
});

test('calendar subscription', async () => {
  await call('/api/events', { method: 'POST', body: { title: 'Синк, вечер', date: '2026-12-01', time: '21:00' } });
  const { calendar_url: url } = (await call('/api/me')).data;
  const response = await fetch(url);
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.match(text, /DTSTART:20261201T160000Z/);
  assert.match(text, /SUMMARY:Синк\\, вечер/);
  assert.ok(text.split('\r\n').every((line) => Buffer.byteLength(line) <= 75));
  assert.equal((await fetch(url.replace('/anna/', '/boris/'))).status, 404);
});

test('import from CSV matches owners and skips duplicates', async () => {
  const rows = parseCsv('﻿Задача,Ответственный,Срок,Статус\n"Задача, с запятой",CEO (Анна),2026-11-20,План\nВторая,COO (Борис),,Выполнено\n');
  const ctx = { db: env.DB, env: {}, user: { login: 'anna', name: 'Anna' } };
  assert.equal((await importRows(ctx, 'tasks', rows)).added, 2);
  assert.equal((await importRows(ctx, 'tasks', rows)).skipped, 2);
  const saved = (await call('/api/tasks?q=запятой')).data[0];
  assert.equal(saved.owner, 'anna');
});

test('the web interface is served with a strict policy and no path escapes', async () => {
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);
  for (const path of ['/..%2fpackage.json', '/%2e%2e/%2e%2e/package.json', '/..%5cpackage.json']) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
});
