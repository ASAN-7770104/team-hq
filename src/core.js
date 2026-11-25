// Business rules. Both the REST API and the MCP tools call these functions.
import { resources } from './schema.js';
import { validate, HttpError } from './validate.js';
import { today, addDays } from './time.js';
import { notifyChange } from './notify.js';

export function resourceOf(name) {
  if (!Object.hasOwn(resources, name)) throw new HttpError(404, `Unknown table: ${name}`);
  return resources[name];
}

export async function team(db) {
  const { results } = await db.prepare('SELECT * FROM users ORDER BY created_at, login').all();
  return results;
}

const marks = (list) => list.map(() => '?').join(', ');

export async function list(ctx, name, filters = {}) {
  const res = resourceOf(name);
  const where = ['archived = 0'];
  const args = [];
  for (const key of ['owner', 'status']) {
    if (filters[key] && res.fields[key]) {
      where.push(`${key} = ?`);
      args.push(filters[key]);
    }
  }
  if (filters.open && res.closed) {
    where.push(`status NOT IN (${marks(res.closed)})`);
    args.push(...res.closed);
  }
  const query = String(filters.q ?? '').trim();
  if (query) {
    // LIKE in SQLite ignores case only for latin letters, so try common spellings.
    const searchable = Object.entries(res.fields).filter(([, f]) => f.type === 'text' || f.type === 'long').map(([k]) => k);
    const variants = [...new Set([query, query.toLowerCase(), query[0].toUpperCase() + query.slice(1).toLowerCase()])];
    const parts = searchable.flatMap((key) => variants.map(() => `instr(COALESCE(${key}, ''), ?) > 0`));
    where.push(`(${parts.join(' OR ')})`);
    searchable.forEach(() => args.push(...variants));
  }
  const limit = Math.min(Math.max(Number(filters.limit) || 500, 1), 1000);
  const { results } = await ctx.db
    .prepare(`SELECT * FROM ${name} WHERE ${where.join(' AND ')} ORDER BY ${res.order} LIMIT ${limit}`)
    .bind(...args)
    .all();
  return results;
}

export async function get(ctx, name, id) {
  resourceOf(name);
  const row = await ctx.db.prepare(`SELECT * FROM ${name} WHERE id = ? AND archived = 0`).bind(Number(id)).first();
  if (!row) throw new HttpError(404, `No record ${id} in ${name}`);
  return row;
}

async function log(ctx, action, name, row) {
  const title = String(row[resources[name].title] ?? '');
  const summary = row.status ? `${title} · ${row.status}` : title;
  await ctx.db
    .prepare('INSERT INTO activity (at, user, action, resource, item_id, summary) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(new Date().toISOString(), ctx.user.login, action, name, row.id, summary.slice(0, 300))
    .run();
}

const logins = async (ctx) => (await team(ctx.db)).map((u) => u.login);

export async function create(ctx, name, input) {
  const res = resourceOf(name);
  const filled = { ...input };
  for (const [key, field] of Object.entries(res.fields)) {
    if (filled[key] !== undefined) continue;
    if (field.default !== undefined) filled[key] = field.default;
    if (field.today) filled[key] = today(ctx.env);
    if (field.self) filled[key] = ctx.user.login;
  }
  const data = validate(name, filled, { logins: await logins(ctx) });

  // A second report for the same person and day updates the first one.
  if (res.unique) {
    const clause = res.unique.map((k) => `${k} = ?`).join(' AND ');
    const existing = await ctx.db.prepare(`SELECT * FROM ${name} WHERE ${clause}`).bind(...res.unique.map((k) => data[k])).first();
    if (existing) {
      const sent = Object.fromEntries(Object.entries(data).filter(([key]) => input[key] !== undefined));
      return write(ctx, name, existing, { ...sent, archived: 0 });
    }
  }

  const now = new Date().toISOString();
  const row = { ...data, created_at: now, updated_at: now, updated_by: ctx.user.login };
  const keys = Object.keys(row);
  const { meta } = await ctx.db
    .prepare(`INSERT INTO ${name} (${keys.join(', ')}) VALUES (${marks(keys)})`)
    .bind(...keys.map((k) => row[k]))
    .run();
  const saved = await get(ctx, name, meta.last_row_id);
  await log(ctx, 'добавил', name, saved);
  await notifyChange(ctx, name, null, saved);
  return saved;
}

async function write(ctx, name, before, changes) {
  const row = { ...changes, updated_at: new Date().toISOString(), updated_by: ctx.user.login };
  const keys = Object.keys(row);
  await ctx.db
    .prepare(`UPDATE ${name} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
    .bind(...keys.map((k) => row[k]), before.id)
    .run();
  const saved = await get(ctx, name, before.id);
  await log(ctx, 'изменил', name, saved);
  await notifyChange(ctx, name, before, saved);
  return saved;
}

export async function update(ctx, name, id, input) {
  const before = await get(ctx, name, id);
  const data = validate(name, input, { partial: true, logins: await logins(ctx) });
  if (!Object.keys(data).length) throw new HttpError(400, 'Nothing to change');
  const { unique } = resources[name];
  if (unique?.some((k) => k in data)) {
    const merged = { ...before, ...data };
    const clash = await ctx.db
      .prepare(`SELECT id FROM ${name} WHERE ${unique.map((k) => `${k} = ?`).join(' AND ')} AND id != ?`)
      .bind(...unique.map((k) => merged[k]), before.id)
      .first();
    if (clash) throw new HttpError(409, 'Такая запись уже есть');
  }
  return write(ctx, name, before, data);
}

// Nothing is deleted for good: the record is hidden.
export async function archive(ctx, name, id) {
  const row = await get(ctx, name, id);
  await ctx.db
    .prepare(`UPDATE ${name} SET archived = 1, updated_at = ?, updated_by = ? WHERE id = ?`)
    .bind(new Date().toISOString(), ctx.user.login, row.id)
    .run();
  await log(ctx, 'убрал в архив', name, row);
}

export async function dashboard(ctx, owner = ctx.user.login) {
  const day = today(ctx.env);
  const everyone = owner === 'all';
  const mine = everyone ? {} : { owner };
  const tasks = await list(ctx, 'tasks', { ...mine, open: true, limit: 1000 });
  const leads = await list(ctx, 'leads', { ...mine, open: true, limit: 1000 });
  const events = (await list(ctx, 'events', { limit: 1000 })).filter((e) => e.date >= day && e.date <= addDays(day, 7));
  const reports = (await list(ctx, 'reports', { limit: 200 })).filter((r) => r.date === day);
  const members = await logins(ctx);
  const done = new Set(reports.map((r) => r.owner));
  return {
    today: day,
    owner,
    tasks: {
      open: tasks.length,
      overdue: tasks.filter((t) => t.due && t.due < day),
      today: tasks.filter((t) => t.due === day),
      blocked: tasks.filter((t) => t.status === 'Заблокировано'),
      in_progress: tasks.filter((t) => t.status === 'В работе'),
    },
    leads_due: leads.filter((l) => l.next_date && l.next_date <= day),
    events,
    reports: { submitted: members.filter((m) => done.has(m)), missing: members.filter((m) => !done.has(m)) },
  };
}

export async function activity(ctx, limit = 100) {
  const { results } = await ctx.db
    .prepare('SELECT * FROM activity ORDER BY id DESC LIMIT ?')
    .bind(Math.min(Math.max(Number(limit) || 100, 1), 500))
    .all();
  return results;
}
