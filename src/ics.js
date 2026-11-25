// Calendar feed that Google Calendar and Apple Calendar can subscribe to.
import { list } from './core.js';
import { addDays } from './time.js';

const escape = (value) => String(value ?? '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
const compact = (isoDate) => isoDate.replaceAll('-', '');

// Lines longer than 75 bytes must be folded.
function fold(line) {
  const encoder = new TextEncoder();
  let result = '';
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (size + bytes > 73) {
      result += '\r\n ';
      size = 1;
    }
    result += char;
    size += bytes;
  }
  return result;
}

function entry(env, uid, stamp, title, date, time, description) {
  const lines = ['BEGIN:VEVENT', `UID:${uid}@team-hq`, `DTSTAMP:${stamp}`];
  if (time) {
    const start = new Date(`${date}T${time}:00Z`);
    start.setUTCHours(start.getUTCHours() - Number(env.UTC_OFFSET ?? 5));
    const format = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    lines.push(`DTSTART:${format(start)}`, `DTEND:${format(new Date(start.getTime() + 3600_000))}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${compact(date)}`, `DTEND;VALUE=DATE:${compact(addDays(date, 1))}`);
  }
  lines.push(`SUMMARY:${escape(title)}`);
  if (description) lines.push(`DESCRIPTION:${escape(description)}`);
  lines.push('END:VEVENT');
  return lines;
}

export async function calendar(ctx) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const events = await list(ctx, 'events', { limit: 1000 });
  const tasks = await list(ctx, 'tasks', { owner: ctx.user.login, open: true, limit: 1000 });
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//team-hq//RU', 'X-WR-CALNAME:Team HQ'];
  for (const e of events) {
    lines.push(...entry(ctx.env, `event-${e.id}`, stamp, e.title, e.date, e.time, [e.place, e.note].filter(Boolean).join('\n')));
  }
  for (const t of tasks.filter((task) => task.due)) {
    lines.push(...entry(ctx.env, `task-${t.id}`, stamp, `✅ ${t.title}`, t.due, null, t.result));
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
