// npm run import -- --file tasks.csv --table tasks --as anna
// npm run import -- --file export.json --as anna        ({ "tasks": [...], "leads": [...] })
// Column names may be field keys ("title") or the Russian labels ("Задача").
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { resources } from '../src/schema.js';
import { create, team, list } from '../src/core.js';
import { openDatabase } from '../server/sqlite.js';

export function parseCsv(text) {
  const rows = [[]];
  let value = '';
  let quoted = false;
  const source = text.replace(/^﻿/, '');
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { value += '"'; i += 1; } else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { rows.at(-1).push(value); value = ''; }
    else if (char === '\n') { rows.at(-1).push(value); value = ''; rows.push([]); }
    else if (char !== '\r') value += char;
  }
  if (value !== '' || rows.at(-1).length) rows.at(-1).push(value);
  const [header, ...body] = rows.filter((r) => r.length);
  return body.map((row) => Object.fromEntries(header.map((name, i) => [name, row[i] ?? ''])));
}

// "CEO (Анна)" matches the user whose login, name or role appears in the value.
function findOwner(value, users) {
  const wanted = String(value).toLowerCase();
  return users.find((u) => [u.login, u.name, u.role].filter(Boolean).some((v) => wanted.includes(v.toLowerCase())))?.login;
}

export async function importRows(ctx, table, rows) {
  const res = resources[table];
  const users = await team(ctx.db);
  const existing = new Set((await list(ctx, table, { limit: 1000 })).map((r) => `${r[res.title]}|${r.owner ?? ''}`));
  const report = { added: 0, skipped: 0, problems: [] };
  for (const [index, row] of rows.entries()) {
    const input = {};
    for (const [key, field] of Object.entries(res.fields)) {
      const raw = row[key] ?? row[field.label];
      if (raw === undefined || raw === null || String(raw).trim() === '') continue;
      let value = String(raw).trim();
      if (field.type === 'user') value = findOwner(value, users);
      if (field.type === 'enum') value = field.options.find((o) => value.toLowerCase().startsWith(o.toLowerCase()));
      if (field.type === 'date') value = value.slice(0, 10);
      if (field.type === 'long') value = value.slice(0, 5000);
      if (field.type === 'text') value = value.slice(0, 500);
      if (value !== undefined) input[key] = value;
    }
    const signature = `${input[res.title]}|${input.owner ?? ''}`;
    if (existing.has(signature)) { report.skipped += 1; continue; }
    try {
      await create(ctx, table, input);
      existing.add(signature);
      report.added += 1;
    } catch (error) {
      report.problems.push(`${table} row ${index + 1}: ${error.message}`);
    }
  }
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { values } = parseArgs({ options: { file: { type: 'string' }, table: { type: 'string' }, as: { type: 'string' } } });
  const db = openDatabase();
  const user = await db.prepare('SELECT * FROM users WHERE login = ?').bind(values.as ?? '').first();
  if (!values.file || !user) {
    console.error('Usage: npm run import -- --file data.csv --table tasks --as <existing login>');
    process.exit(1);
  }
  const text = readFileSync(values.file, 'utf8');
  const data = values.file.endsWith('.json') ? JSON.parse(text.replace(/^﻿/, '')) : { [values.table]: parseCsv(text) };
  for (const [table, rows] of Object.entries(data)) {
    if (!resources[table]) { console.error(`Unknown table: ${table} (use --table)`); process.exitCode = 1; continue; }
    // Imported rows must not send notifications.
    const report = await importRows({ db, env: { ...process.env, TELEGRAM_BOT_TOKEN: '' }, user }, table, rows);
    console.log(`${table}: added ${report.added}, skipped ${report.skipped}, problems ${report.problems.length}`);
    report.problems.slice(0, 20).forEach((p) => console.log(`  ${p}`));
  }
  db.close();
}
