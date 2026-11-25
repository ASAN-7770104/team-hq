// Each person has one secret token. Only its SHA-256 hash is stored.
// Links that have to carry a secret in the address (Claude connector, calendar)
// use separate keys derived from the hash, so the login token never appears in a URL.

export async function sha256(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `hq_${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export const linkKey = (purpose, user) => sha256(`${purpose}:${user.token_hash}`);

export async function userByToken(db, token) {
  if (!token) return null;
  return db.prepare('SELECT * FROM users WHERE token_hash = ?').bind(await sha256(token)).first();
}

export async function userByLink(db, purpose, login, key) {
  const user = await db.prepare('SELECT * FROM users WHERE login = ?').bind(login).first();
  return user && (await linkKey(purpose, user)) === key ? user : null;
}

export const bearer = (request) => request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? null;

export const publicUser = ({ login, name, role }) => ({ login, name, role });

export async function addUser(db, { login, name, role = null, telegram = null }) {
  if (!/^[a-z][a-z0-9_-]{1,30}$/.test(login)) throw new Error('login: use 2-31 latin letters, digits, "-" or "_"');
  const token = newToken();
  await db
    .prepare(`INSERT INTO users (login, name, role, token_hash, telegram_chat_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (login) DO UPDATE SET name = excluded.name, role = excluded.role,
        token_hash = excluded.token_hash,
        telegram_chat_id = COALESCE(excluded.telegram_chat_id, users.telegram_chat_id)`)
    .bind(login, name, role, await sha256(token), telegram, new Date().toISOString())
    .run();
  return token;
}
