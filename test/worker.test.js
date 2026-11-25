// The Cloudflare entry point, run against the local database adapter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { openDatabase } from '../server/sqlite.js';
import { addUser } from '../src/auth.js';

test('the worker answers the API and passes other addresses to static assets', async () => {
  const env = { DB: openDatabase(':memory:'), ASSETS: { fetch: async () => new Response('asset') } };
  const key = await addUser(env.DB, { login: 'anna', name: 'Anna' });
  const execution = { waitUntil: () => {} };
  const get = (path, headers) => worker.fetch(new Request(`https://hq.example${path}`, { headers }), env, execution);

  assert.deepEqual(await (await get('/health')).json(), { ok: true });
  assert.equal(await (await get('/app.js')).text(), 'asset');
  const me = await (await get('/api/me', { authorization: `Bearer ${key}` })).json();
  assert.match(me.claude_url, /^https:\/\/hq\.example\/mcp\/anna\/[0-9a-f]{64}$/);
  env.DB.close();
});
