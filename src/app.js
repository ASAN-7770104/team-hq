// HTTP routing on top of the web-standard Request and Response objects, so the
// same code runs on Cloudflare Workers and on plain Node.js.
import { resources } from './schema.js';
import { HttpError } from './validate.js';
import { bearer, userByToken, userByLink, linkKey, publicUser } from './auth.js';
import { team, list, get, create, update, archive, dashboard, activity } from './core.js';
import { handleMcp } from './mcp.js';
import { calendar } from './ics.js';
import { today } from './time.js';

const MAX_BODY = 100_000;

const json = (data, status = 200) =>
  Response.json(data, { status, headers: { 'cache-control': 'no-store' } });

async function body(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'Request is too large');
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Body is not valid JSON');
  }
}

async function me(ctx, origin) {
  const { user } = ctx;
  return {
    ...publicUser(user),
    telegram_chat_id: user.telegram_chat_id,
    telegram_enabled: Boolean(ctx.env.TELEGRAM_BOT_TOKEN),
    claude_url: `${origin}/mcp/${user.login}/${await linkKey('mcp', user)}`,
    calendar_url: `${origin}/calendar/${user.login}/${await linkKey('ics', user)}.ics`,
  };
}

async function api(ctx, request, url, parts) {
  const [first, id] = parts;
  const { method } = request;
  if (first === 'meta' && method === 'GET') {
    return json({ resources, team: (await team(ctx.db)).map(publicUser), me: ctx.user.login, today: today(ctx.env) });
  }
  if (first === 'me') {
    if (method === 'PATCH') {
      const chat = String((await body(request)).telegram_chat_id ?? '').trim();
      if (chat && !/^-?\d{3,20}$/.test(chat)) throw new HttpError(400, 'Telegram chat id consists of digits');
      await ctx.db.prepare('UPDATE users SET telegram_chat_id = ? WHERE login = ?').bind(chat || null, ctx.user.login).run();
      ctx.user.telegram_chat_id = chat || null;
    }
    return json(await me(ctx, ctx.env.PUBLIC_URL || url.origin));
  }
  if (first === 'dashboard' && method === 'GET') return json(await dashboard(ctx, url.searchParams.get('user') || ctx.user.login));
  if (first === 'activity' && method === 'GET') return json(await activity(ctx, url.searchParams.get('limit')));

  if (id === undefined) {
    if (method === 'GET') return json(await list(ctx, first, Object.fromEntries(url.searchParams)));
    if (method === 'POST') return json(await create(ctx, first, await body(request)), 201);
  } else if (/^\d+$/.test(id)) {
    if (method === 'GET') return json(await get(ctx, first, id));
    if (method === 'PATCH') return json(await update(ctx, first, id, await body(request)));
    if (method === 'DELETE') {
      await archive(ctx, first, id);
      return new Response(null, { status: 204 });
    }
  }
  throw new HttpError(404, 'Not found');
}

// Returns null when the address belongs to the static web interface.
export async function handle(request, env, waitUntil) {
  const url = new URL(request.url);
  const [area, ...parts] = url.pathname.split('/').filter(Boolean);
  if (!['api', 'mcp', 'calendar', 'health'].includes(area)) return null;
  try {
    if (area === 'health') return json({ ok: true });
    const db = env.DB;
    const context = (user) => ({ db, env, user, waitUntil });

    if (area === 'calendar') {
      const [login, file = ''] = parts;
      const user = await userByLink(db, 'ics', login, file.replace(/\.ics$/, ''));
      if (!user) throw new HttpError(404, 'Not found');
      return new Response(await calendar(context(user)), { headers: { 'content-type': 'text/calendar; charset=utf-8' } });
    }

    if (area === 'mcp') {
      const [login, key] = parts;
      const user = login ? await userByLink(db, 'mcp', login, key) : await userByToken(db, bearer(request));
      if (!user) return json({ error: 'Unauthorized' }, 401);
      return handleMcp(context(user), request);
    }

    const user = await userByToken(db, bearer(request));
    if (!user) throw new HttpError(401, 'Нужен ключ доступа');
    return await api(context(user), request, url, parts);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    console.error(error);
    return json({ error: 'Internal error' }, 500);
  }
}
