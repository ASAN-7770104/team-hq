// Phone notifications through a Telegram bot. Everything here is optional:
// without TELEGRAM_BOT_TOKEN nothing is sent and the app works as usual.

import { L, shown } from '../public/i18n.js';
export async function sendTelegram(env, chatId, text) {
  if (!env.TELEGRAM_BOT_TOKEN || !chatId) return false;
  try {
    const send = env.fetch ?? fetch;
    const response = await send(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000) }),
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch (error) {
    // Never log the URL: it contains the bot token.
    console.error('Telegram message was not sent:', error.name);
    return false;
  }
}

const members = async (db) => (await db.prepare('SELECT * FROM users').all()).results;

export async function notifyChange(ctx, resource, before, after) {
  if (resource !== 'tasks' || !ctx.env.TELEGRAM_BOT_TOKEN) return;
  const users = await members(ctx.db);
  const actor = ctx.user.name;
  const messages = [];
  if (after.owner && after.owner !== ctx.user.login && before?.owner !== after.owner) {
    const owner = users.find((u) => u.login === after.owner);
    const due = after.due ? L(`\nСрок: ${after.due}`, `\nDue: ${after.due}`) : '';
    messages.push([owner, L(`📌 ${actor} назначил вам задачу:\n${after.title}${due}`, `📌 ${actor} gave you a task:\n${after.title}${due}`)]);
  }
  if (after.status === 'Заблокировано' && before?.status !== 'Заблокировано') {
    for (const user of users.filter((u) => u.login !== ctx.user.login)) {
      messages.push([user, L(`⛔ Блокер у задачи «${after.title}» (${actor})\n${after.note ?? ''}`, `⛔ Blocker on the task "${after.title}" (${actor})\n${after.note ?? ''}`).trim()]);
    }
  }
  const job = Promise.all(messages.map(([user, text]) => sendTelegram(ctx.env, user?.telegram_chat_id, text)));
  if (ctx.waitUntil) ctx.waitUntil(job);
  else await job;
}

const lines = (title, items, format) =>
  items.length ? [`\n${title} (${items.length})`, ...items.slice(0, 8).map((i) => `• ${format(i)}`)] : [];

export function morningText(user, day) {
  const body = [
    ...lines(L('🔥 Просрочено', '🔥 Overdue'), day.tasks.overdue, (t) => `${t.title} (${t.due})`),
    ...lines(L('📌 На сегодня', '📌 Today'), day.tasks.today, (t) => t.title),
    ...lines(L('⛔ Заблокировано', '⛔ Blocked'), day.tasks.blocked, (t) => t.title),
    ...lines(L('🤝 Шаги по лидам', '🤝 Lead steps'), day.leads_due, (l) => L(`${l.company}: ${l.next_step ?? 'следующий шаг'}`, `${l.company}: ${l.next_step ?? 'next step'}`)),
    ...lines(L('📅 События на неделе', '📅 Events this week'), day.events, (e) => `${e.date} ${e.time ?? ''} ${e.title}`),
  ];
  return [L(`Доброе утро, ${user.name}!`, `Good morning, ${user.name}!`), ...(body.length ? body : [L('\nСрочного нет.', '\\nNothing urgent.')])].join('\n');
}

// kind: "morning" sends each person their day, "evening" reminds about the report.
export async function digest(ctx, kind, dashboard) {
  let sent = 0;
  for (const user of await members(ctx.db)) {
    if (!user.telegram_chat_id) continue;
    const day = await dashboard({ ...ctx, user }, user.login);
    if (kind === 'evening' && !day.reports.missing.includes(user.login)) continue;
    const text = kind === 'morning'
      ? morningText(user, day)
      : L(`${user.name}, отчёт дня ещё не сдан: что сделано, цифры, что мешает, план на завтра.`, `${user.name}, the daily report is not sent yet: done, numbers, blockers, plan for tomorrow.`);
    if (await sendTelegram(ctx.env, user.telegram_chat_id, text)) sent += 1;
  }
  return sent;
}
