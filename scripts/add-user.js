// npm run user -- --login anna --name "Anna" --role CEO [--telegram 123456] [--url https://hq.example.workers.dev]
import { parseArgs } from 'node:util';
import { addUser, linkKey } from '../src/auth.js';
import { openDatabase } from '../server/sqlite.js';

const { values } = parseArgs({
  options: {
    login: { type: 'string' }, name: { type: 'string' }, role: { type: 'string' },
    telegram: { type: 'string' }, url: { type: 'string', default: 'http://localhost:8787' },
  },
});

if (!values.login || !values.name) {
  console.error('Usage: npm run user -- --login anna --name "Anna" [--role CEO] [--telegram 123456]');
  process.exit(1);
}

const db = openDatabase();
const token = await addUser(db, values);
const user = await db.prepare('SELECT * FROM users WHERE login = ?').bind(values.login).first();
console.log(`
User "${values.name}" is ready. Running this again issues a new key and cancels the old one.

  Access key (shown once):  ${token}
  Sign-in link:             ${values.url}/#key=${token}
  Claude connector:         ${values.url}/mcp/${values.login}/${await linkKey('mcp', user)}

Send these only to their owner.`);
db.close();
