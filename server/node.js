// Runs the workspace on your own computer or any Node.js server.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { handle } from '../src/app.js';
import { dashboard } from '../src/core.js';
import { digest } from '../src/notify.js';
import { localNow } from '../src/time.js';
import { openDatabase } from './sqlite.js';

const PUBLIC = fileURLToPath(new URL('../public', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json',
};
const SECURITY = {
  'content-security-policy': "default-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

async function staticFile(pathname) {
  const relative = normalize(decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
  const file = join(PUBLIC, relative);
  if (!file.startsWith(PUBLIC + sep) || !TYPES[extname(file)]) return null;
  try {
    return new Response(await readFile(file), { headers: { 'content-type': TYPES[extname(file)], ...SECURITY } });
  } catch {
    return null;
  }
}

async function readBody(incoming) {
  const chunks = [];
  let size = 0;
  for await (const chunk of incoming) {
    size += chunk.length;
    if (size > 200_000) throw new Error('too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function createApp(env) {
  return createServer(async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url, `http://${incoming.headers.host || 'localhost'}`);
      const hasBody = !['GET', 'HEAD'].includes(incoming.method);
      const request = new Request(url, {
        method: incoming.method,
        headers: incoming.headers,
        body: hasBody ? await readBody(incoming) : undefined,
      });
      const response = (await handle(request, env))
        ?? (await staticFile(url.pathname))
        ?? new Response('Not found', { status: 404 });
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      console.error(error.message);
      outgoing.writeHead(400).end('Bad request');
    }
  });
}

// Sends the morning digest and the evening reminder while the server is running.
function schedule(env) {
  const sent = new Set();
  setInterval(async () => {
    const now = localNow(env);
    const kind = { 9: 'morning', 21: 'evening' }[now.getUTCHours()];
    const key = `${now.toISOString().slice(0, 10)} ${kind}`;
    if (!kind || now.getUTCMinutes() > 5 || sent.has(key)) return;
    sent.add(key);
    await digest({ db: env.DB, env }, kind, dashboard);
  }, 60_000).unref();
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  // Optional first argument: path to another database file (for example the demo one).
  const env = { ...process.env, DB: openDatabase(process.argv[2]) };
  const port = Number(process.env.PORT) || 8787;
  // Listens only on this computer unless HOST is set (for example HOST=0.0.0.0 for the local network).
  const host = process.env.HOST || '127.0.0.1';
  createApp(env).listen(port, host, () => console.log(`Team HQ: http://localhost:${port}`));
  if (env.TELEGRAM_BOT_TOKEN) schedule(env);
}
