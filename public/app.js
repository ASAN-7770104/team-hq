import { L, LANG, shown, switchLanguage } from './i18n.js';

document.documentElement.lang = LANG;
const root = document.querySelector('#app');
const editor = document.querySelector('#editor');
const toastBox = document.querySelector('#toast');
editor.setAttribute('aria-label', L('Запись', 'Record'));

const storage = {
  get: () => { try { return localStorage.getItem('hq_key'); } catch { return null; } },
  set: (v) => { try { v ? localStorage.setItem('hq_key', v) : localStorage.removeItem('hq_key'); } catch { /* private mode */ } },
};

const TABLES = ['tasks', 'leads', 'events', 'reports', 'content', 'ideas'];
const state = { key: storage.get(), meta: null, data: {}, owner: '', todayOwner: '', query: '', openOnly: true, view: {} };

// DOM helper. Text always goes in as text, never as HTML.
function h(tag, props, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (name.startsWith('on')) node.addEventListener(name.slice(2), value);
    else if (name === 'class') node.className = value;
    else if (name in node && name !== 'list') node[name] = value;
    else node.setAttribute(name, value);
  }
  node.append(...children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}
const fill = (box, ...children) => box.replaceChildren(...children.flat(Infinity).filter(Boolean));

function toast(message) {
  toastBox.textContent = message;
  toastBox.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => toastBox.classList.remove('show'), 3500);
}

const ICONS = {
  today: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  tasks: 'M9 11.5l3 3L21 5.5M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9',
  leads: 'M15.5 20v-1.5a4 4 0 0 0-4-4h-5a4 4 0 0 0-4 4V20M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21.5 20v-1.5a4 4 0 0 0-3-3.9M15.5 4.2a3.5 3.5 0 0 1 0 6.6',
  claude: 'M11 3l1.8 5.2L18 10l-5.2 1.8L11 17l-1.8-5.2L4 10l5.2-1.8zM18.5 15.5v5M16 18h5',
  events: 'M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10.5h16M8 3v4M16 3v4',
  reports: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4',
  content: 'M3 8a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM16 10.5l5-3v9l-5-3',
  ideas: 'M9.5 18h5M10.5 21h3M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3',
  history: 'M12 21a9 9 0 1 0-8.5-6M3 20v-5h5M12 7.5V12l3 2',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20 20l-4-4',
  send: 'M12 19V5M6 11l6-6 6 6',
  close: 'M6 6l12 12M18 6 6 18',
};
function icon(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'i');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', ICONS[name]);
  svg.append(path);
  return svg;
}

/* ---------- data ---------- */

async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(`/api/${path}`, {
    method,
    headers: { authorization: `Bearer ${state.key}`, 'content-type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) { logout(); throw new Error(L('Ключ не подошёл', 'The key was not accepted')); }
  if (!response.ok) throw new Error(shown(data.error) || L('Ошибка сервера', 'Server error'));
  return data;
}

async function load() {
  const [meta, ...lists] = await Promise.all([api('meta'), ...TABLES.map((t) => api(`${t}?limit=1000`))]);
  state.meta = meta;
  TABLES.forEach((t, i) => { state.data[t] = lists[i]; });
}

let view = null;
// Reload from the server and repaint the parts of the page that depend on data.
async function reload() {
  await load();
  paintChrome();
  view?.refresh();
}

async function create(table, body) { await api(table, { method: 'POST', body }); await reload(); }
async function change(table, id, body) { await api(`${table}/${id}`, { method: 'PATCH', body }); await reload(); }
async function archive(table, id) { await api(`${table}/${id}`, { method: 'DELETE' }); await reload(); }

function logout() {
  state.key = null;
  state.meta = null;
  storage.set(null);
  render();
}

const resource = (name) => state.meta.resources[name];
const team = () => state.meta.team;
const today = () => state.meta.today;
const person = (login) => team().find((u) => u.login === login)?.name ?? login ?? '—';
const short = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : '');
const when = (iso) => (iso ? new Date(iso).toLocaleString(L('ru-RU', 'en-GB'), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const addDays = (iso, days) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const plural = (n, one, few, many, single, several) => `${n} ${LANG === 'en' ? (n === 1 ? single : several) : n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many}`;
const rows = (name) => state.data[name] ?? [];
const isOpen = (name, item) => !resource(name).closed?.includes(item.status);

function dayOf(owner) {
  const day = today();
  const mine = (x) => owner === 'all' || x.owner === owner;
  const tasks = rows('tasks').filter((x) => isOpen('tasks', x) && mine(x));
  const sent = new Set(rows('reports').filter((r) => r.date === day).map((r) => r.owner));
  return {
    open: tasks.length,
    overdue: tasks.filter((t) => t.due && t.due < day),
    now: tasks.filter((t) => t.due === day),
    blocked: tasks.filter((t) => t.status === 'Заблокировано'),
    working: tasks.filter((t) => t.status === 'В работе'),
    leads: rows('leads').filter((l) => isOpen('leads', l) && mine(l) && l.next_date && l.next_date <= day),
    events: rows('events').filter((e) => e.date >= day && e.date <= addDays(day, 7)),
    submitted: team().map((u) => u.login).filter((l) => sent.has(l)),
  };
}

/* ---------- interface pieces ---------- */

const TONES = { 'В работе': 'accent', 'Диалог': 'accent', 'Созвон': 'accent', 'Берём': 'accent', 'Контакт': 'info', 'На проверке': 'warn', 'КП / Счёт': 'warn', 'Готово': 'warn',
  'Заблокировано': 'bad', 'Отказ': 'bad', 'Отклонена': 'bad', 'Выполнено': 'ok', 'Оплачено': 'ok', 'Опубликовано': 'ok' };
const tone = (status) => `t-${TONES[status] || 'off'}`;
const avatar = (login, big) => {
  const index = team().findIndex((u) => u.login === login);
  const color = index < 0 ? 'none' : `c${index % 4}`;
  return h('span', { class: `av ${color}${big ? ' big' : ''}`, title: person(login), 'aria-label': person(login) }, login ? person(login).slice(0, 1) : '–');
};
const header = (title, sub, ...actions) => h('header', null, h('div', null, h('h1', null, title), sub ? h('p', null, sub) : null), h('div', { class: 'row' }, actions));
const addButton = (name, label) => h('button', { class: 'primary', type: 'button', onclick: () => openEditor(name) }, icon('plus'), label || L('Добавить', 'Add'));
const segment = (current, options, choose) => h('div', { class: 'segment', role: 'group' }, options.map(([value, label, login]) =>
  h('button', { class: value === current ? 'active' : '', type: 'button', 'aria-pressed': String(value === current), onclick: () => choose(value) }, login ? avatar(login) : null, label)));
const ownerOptions = () => [['', L('Все', 'Everyone')], ...team().map((u) => [u.login, u.name, u.login])];

function control(key, field, value, prefix) {
  const common = { name: key, id: prefix + key, required: Boolean(field.required) };
  if (field.type === 'long') return h('textarea', { ...common, rows: 3, maxLength: 5000 }, value || '');
  if (field.type === 'enum' || field.type === 'user') {
    const options = field.type === 'enum' ? field.options.map((o) => [o, shown(o)]) : [['', '—'], ...team().map((u) => [u.login, u.name])];
    const select = h('select', common, options.map(([v, l]) => h('option', { value: v }, l)));
    select.value = value || '';
    return select;
  }
  const type = { date: 'date', time: 'time', number: 'number', url: 'url' }[field.type] || 'text';
  return h('input', { ...common, type, value: value ?? '', step: type === 'number' ? 'any' : null });
}

// A record opens as a side panel (a bottom sheet on phones).
function openEditor(name, item) {
  const res = resource(name);
  const values = item ? { ...item } : {};
  if (!item) {
    for (const [key, field] of Object.entries(res.fields)) {
      if (field.default !== undefined) values[key] = field.default;
      if (field.type === 'user') values[key] = state.owner || state.meta.me;
      if (field.today) values[key] = today();
    }
  }
  let confirming = false;
  const entries = Object.entries(res.fields);
  const isWide = ([, f]) => f.type === 'long' || f.required;
  const label = ([key, field]) => h('label', { for: `e-${key}` }, h('span', null, shown(field.label)), control(key, field, values[key], 'e-'));
  const form = h('form', {
    onsubmit: async (event) => {
      event.preventDefault();
      const data = {};
      for (const key of Object.keys(res.fields)) {
        const raw = form.elements.namedItem(key).value;
        if (item ? String(item[key] ?? '') !== raw : raw !== '') data[key] = raw;
      }
      try {
        if (!item) await create(name, data);
        else if (Object.keys(data).length) await change(name, item.id, data);
        editor.close();
        toast(L('Сохранено', 'Saved'));
      } catch (error) { toast(error.message); }
    },
  },
  h('div', { class: 'head' }, h('div', null, h('h2', null, item ? shown(res.label) : L('Новая запись', 'New record')),
    h('p', { class: 'muted' }, item ? L(`Изменено: ${person(item.updated_by)}, ${when(item.updated_at)}`, `Changed: ${person(item.updated_by)}, ${when(item.updated_at)}`) : shown(res.label))),
  h('button', { type: 'button', class: 'ghost', 'aria-label': L('Закрыть', 'Close'), onclick: () => editor.close() }, icon('close'))),
  h('div', { class: 'body' },
    entries.filter(([, f]) => f.required).map(label),
    h('div', { class: 'two' }, entries.filter((e) => !isWide(e)).map(label)),
    entries.filter(([, f]) => f.type === 'long' && !f.required).map(label)),
  h('div', { class: 'actions' },
    item && h('button', {
      type: 'button', class: 'danger ghost',
      onclick: async (e) => {
        if (!confirming) { confirming = true; e.target.textContent = L('Точно в архив?', 'Archive it for sure?'); return; }
        try { await archive(name, item.id); editor.close(); toast(L('Убрано в архив', 'Archived')); } catch (error) { toast(error.message); }
      },
    }, L('В архив', 'Archive')),
    h('span', { class: 'spacer' }),
    h('button', { type: 'button', onclick: () => editor.close() }, L('Отмена', 'Cancel')),
    h('button', { class: 'primary', type: 'submit' }, L('Сохранить', 'Save'))));
  fill(editor, form);
  editor.showModal();
}

const isLate = (name, item) => { const d = item.due || item.next_date; return Boolean(d) && d < today() && isOpen(name, item); };
function dateTag(name, item) {
  const d = item.due || item.next_date || item.date;
  return d ? h('span', { class: `tag${isLate(name, item) ? ' late' : ''}` }, `${short(d)}${item.time ? ` ${item.time}` : ''}`) : null;
}
const subtitle = (item) => item.next_step || item.place || item.platform || item.category || item.channel || '';
const titleButton = (name, item) => h('button', { class: 'link', type: 'button', onclick: () => openEditor(name, item) }, String(item[resource(name).title] || L('Без названия', 'Untitled')));

function statusPicker(name, item) {
  const select = h('select', {
    class: `status ${tone(item.status)}`, 'aria-label': L('Статус', 'Status'),
    onchange: async (e) => {
      try { await change(name, item.id, { status: e.target.value }); } catch (error) { toast(error.message); e.target.value = item.status; }
    },
  }, resource(name).fields.status.options.map((o) => h('option', { value: o }, shown(o))));
  select.value = item.status;
  return select;
}

function line(name, item, { picker = false, dot = true } = {}) {
  const sub = subtitle(item);
  return h('div', { class: 'line' },
    dot ? h('span', { class: `dot ${tone(item.status)}`, title: shown(item.status || item.type || '') }) : null,
    h('div', { class: 'name' }, titleButton(name, item), sub ? h('div', { class: 'sub' }, sub) : null),
    h('div', { class: 'right' },
      item.priority === 'P0' ? h('span', { class: 'tag P0' }, 'P0') : null,
      item.amount ? h('span', { class: 'num' }, item.amount.toLocaleString(L('ru-RU', 'en-US'))) : null,
      dateTag(name, item),
      picker ? statusPicker(name, item) : null,
      avatar(item.owner)));
}

const card = (name, item) => h('article', { class: 'item' },
  titleButton(name, item),
  subtitle(item) ? h('p', null, subtitle(item)) : null,
  h('div', { class: 'foot' }, avatar(item.owner), item.priority ? h('span', { class: `tag ${item.priority}` }, item.priority) : null, dateTag(name, item), statusPicker(name, item)));

/* ---------- pages ---------- */

function todayPage() {
  const head = h('div');
  const people = h('div');
  const body = h('div');
  const expanded = new Set();
  const input = h('input', { id: 'quick', maxLength: 500, placeholder: L('Новая задача на сегодня', 'New task for today'), 'aria-label': L('Новая задача на сегодня', 'New task for today') });
  const composer = h('form', {
    class: 'composer',
    onsubmit: async (e) => {
      e.preventDefault();
      const title = input.value.trim();
      if (!title) return;
      const owner = state.todayOwner && state.todayOwner !== 'all' ? state.todayOwner : state.meta.me;
      try { await create('tasks', { title, owner, due: today() }); input.value = ''; toast(L('Задача добавлена', 'Task added')); } catch (error) { toast(error.message); }
    },
  }, icon('plus'), input, h('button', { class: 'primary', type: 'submit', 'aria-label': L('Добавить задачу', 'Add task') }, icon('send')));

  const refresh = () => {
    const owner = state.todayOwner || state.meta.me;
    const hour = new Date().getHours();
    const greet = hour < 5 ? L('Доброй ночи', 'Good night') : hour < 12 ? L('Доброе утро', 'Good morning') : hour < 18 ? L('Добрый день', 'Good afternoon') : L('Добрый вечер', 'Good evening');
    const date = new Date(`${today()}T00:00:00`).toLocaleDateString(L('ru-RU', 'en-GB'), { weekday: 'long', day: 'numeric', month: 'long' });
    fill(head, header(`${greet}, ${person(state.meta.me)}`, date,
      segment(owner === 'all' ? 'all' : 'one', [['one', L('Один человек', 'One person')], ['all', L('Вся команда', 'Whole team')]], (v) => { state.todayOwner = v === 'all' ? 'all' : state.meta.me; refresh(); }),
      addButton('tasks', L('Задача', 'Task'))));
    const top = Math.max(1, ...team().map((u) => dayOf(u.login).open));
    fill(people, h('div', { class: 'team' }, team().map((u) => {
      const d = dayOf(u.login);
      const sent = d.submitted.includes(u.login);
      const late = h('i', { class: 'a' });
      const rest = h('i', { class: 'b' });
      late.style.width = `${(d.overdue.length / top) * 100}%`;
      rest.style.width = `${((d.open - d.overdue.length) / top) * 100}%`;
      return h('button', { type: 'button', class: `member${owner === u.login ? ' active' : ''}`, 'aria-pressed': String(owner === u.login), onclick: () => { state.todayOwner = u.login; refresh(); } },
        h('span', { class: 'who' }, avatar(u.login, true), h('span', null, u.name, h('small', null, u.role ?? '')), h('span', { class: 'spacer' }), h('span', { class: `tag${sent ? ' ok' : ''}` }, sent ? L('отчёт есть', 'report sent') : L('нет отчёта', 'no report'))),
        h('span', { class: 'figures' }, h('span', { class: 'opened' }, h('b', null, String(d.open)), L('открыто', 'open')), h('span', { class: d.overdue.length ? 'red' : '' }, h('b', null, String(d.overdue.length)), L('просрочено', 'overdue'))),
        h('span', { class: 'meter' }, late, rest));
    })));
    const d = dayOf(owner);
    const groups = [[L('Заблокировано', 'Blocked'), 'bad', d.blocked], [L('На сегодня', 'Today'), 'accent', d.now], [L('Просрочено', 'Overdue'), 'bad', d.overdue],
      [L('В работе', 'In progress'), 'info', d.working.filter((t) => !d.overdue.includes(t) && !d.now.includes(t))]].filter((g) => g[2].length);
    const attention = h('section', { class: 'panel' },
      h('header', null, h('h2', null, L('Требует внимания', 'Needs attention')), h('a', { href: '#tasks', class: 'muted' }, L('Все задачи', 'All tasks'))),
      groups.length ? groups.map(([title, color, list]) => {
        const limit = expanded.has(title) ? list.length : 5;
        return h('div', null,
          h('div', { class: 'group-title' }, h('span', { class: `dot t-${color}` }), title, h('span', { class: 'count' }, String(list.length))),
          list.slice(0, limit).map((i) => line('tasks', i, { dot: false })),
          list.length > 5 ? h('div', { class: 'more' }, h('button', { type: 'button', class: 'ghost', onclick: () => { expanded.has(title) ? expanded.delete(title) : expanded.add(title); refresh(); } }, expanded.has(title) ? L('Свернуть', 'Collapse') : L(`Показать ещё ${list.length - 5}`, `Show ${list.length - 5} more`))) : null);
      }) : h('p', { class: 'empty' }, L('Срочного нет. Можно брать задачи из плана.', 'Nothing urgent. Take tasks from the plan.')));
    const side = (title, name, list, empty) => h('section', { class: 'panel' },
      h('header', null, h('h2', null, title, h('span', { class: 'count' }, String(list.length))), h('a', { href: `#${name}`, class: 'muted' }, L('Открыть', 'Open'))),
      list.length ? list.slice(0, 6).map((i) => line(name, i, { dot: false })) : h('p', { class: 'empty' }, empty));
    fill(body, h('div', { class: 'columns' }, attention, h('div', { class: 'side' },
      side(L('События на 7 дней', 'Events in 7 days'), 'events', d.events, L('На этой неделе событий нет.', 'No events this week.')),
      side(L('Шаги по лидам', 'Lead steps'), 'leads', d.leads, L('Срочных шагов по клиентам нет.', 'No urgent client steps.')))));
  };
  refresh();
  return { nodes: [head, composer, people, body], refresh };
}

function boardPage(name) {
  const content = h('div');
  const owners = h('div');
  const views = h('div');
  const head = h('div');
  const refresh = () => {
    const res = resource(name);
    const q = state.query.trim().toLowerCase();
    const items = rows(name).filter((x) => (!state.owner || x.owner === state.owner)
      && (!q || Object.keys(res.fields).some((k) => String(x[k] ?? '').toLowerCase().includes(q))));
    const statuses = res.fields.status.options.filter((s) => !state.openOnly || !res.closed?.includes(s));
    const visible = items.filter((i) => statuses.includes(i.status));
    const mode = state.view[name] || (name === 'leads' ? 'list' : 'board');
    fill(head, header(shown(res.label), L(`${plural(visible.length, 'запись', 'записи', 'записей')}${state.openOnly ? ' в работе' : ''}`, `${plural(visible.length, 'запись', 'записи', 'записей', 'record', 'records')}${state.openOnly ? ' open' : ''}`), addButton(name)));
    fill(owners, segment(state.owner, ownerOptions(), (v) => { state.owner = v; refresh(); }));
    fill(views, segment(mode, [['board', L('Доска', 'Board')], ['list', L('Список', 'List')]], (v) => { state.view[name] = v; refresh(); }));
    if (mode === 'list') {
      fill(content, h('section', { class: 'panel list' }, visible.length
        ? statuses.flatMap((s) => visible.filter((i) => i.status === s)).map((i) => line(name, i, { picker: true }))
        : h('p', { class: 'empty' }, L('Ничего не найдено.', 'Nothing found.'))));
    } else {
      fill(content, h('div', { class: 'board' }, statuses.map((s) => {
        const group = visible.filter((i) => i.status === s);
        return h('section', { class: `column ${tone(s)}${group.length ? '' : ' none'}` }, h('h2', null, shown(s), h('span', { class: 'count' }, String(group.length))), group.map((i) => card(name, i)));
      })));
    }
  };
  const filters = h('div', { class: 'row' }, owners,
    h('div', { class: 'search' }, icon('search'), h('input', { type: 'search', id: 'search', placeholder: L('Поиск', 'Search'), 'aria-label': L('Поиск', 'Search'), value: state.query, oninput: (e) => { state.query = e.target.value; refresh(); } })),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'open-only', checked: state.openOnly, onchange: (e) => { state.openOnly = e.target.checked; refresh(); } }), L('только открытые', 'open only')),
    h('span', { class: 'spacer' }), views);
  filters.querySelector('label.check').style.margin = '0';
  refresh();
  return { nodes: [head, filters, content], refresh };
}

function eventsPage() {
  const body = h('div');
  let showPast = false;
  const refresh = () => {
    const all = rows('events');
    const group = (list) => [...new Set(list.map((e) => e.date))].map((d) => {
      const date = new Date(`${d}T00:00:00`);
      return h('section', { class: 'agenda' },
        h('div', { class: `date${d === today() ? ' now' : ''}` }, date.toLocaleDateString(L('ru-RU', 'en-GB'), { weekday: 'short' }), h('b', null, String(date.getDate())), date.toLocaleDateString(L('ru-RU', 'en-GB'), { month: 'short' })),
        h('div', { class: 'panel' }, list.filter((e) => e.date === d).map((e) => line('events', e, { dot: false }))));
    });
    const next = all.filter((e) => e.date >= today());
    const past = all.filter((e) => e.date < today()).reverse();
    fill(body, next.length ? group(next) : h('div', { class: 'panel' }, h('p', { class: 'empty' }, L('Впереди событий нет. Добавьте встречу или дедлайн.', 'No upcoming events. Add a meeting or a deadline.'))),
      past.length ? h('div', null, h('button', { type: 'button', class: 'ghost', onclick: () => { showPast = !showPast; refresh(); } }, L(`${showPast ? 'Скрыть прошедшие' : 'Прошедшие'} (${past.length})`, `${showPast ? 'Hide past' : 'Past'} (${past.length})`))) : null,
      showPast ? group(past) : null);
  };
  refresh();
  return { nodes: [header(L('Календарь', 'Calendar'), L('Встречи, синки и дедлайны команды', 'Meetings, syncs and team deadlines'), addButton('events', L('Событие', 'Event'))), body], refresh };
}

function reportsPage() {
  const keys = ['done', 'numbers', 'blockers', 'plan'];
  const fields = resource('reports').fields;
  const status = h('div');
  const feed = h('div');
  let dirty = false;
  const form = h('form', {
    class: 'panel',
    oninput: () => { dirty = true; },
    onsubmit: async (event) => {
      event.preventDefault();
      // One report per person per day: the server updates today's report if it exists.
      const body = Object.fromEntries(keys.map((k) => [k, form.elements.namedItem(k).value]));
      try { dirty = false; await create('reports', body); toast(L('Отчёт сохранён', 'Report saved')); } catch (error) { dirty = true; toast(error.message); }
    },
  }, h('header', null, h('h2', null, L('Мой отчёт за сегодня', 'My report for today')), h('button', { class: 'primary', type: 'submit' }, L('Сохранить', 'Save'))),
  h('div', { class: 'pad two' }, keys.map((k) => h('label', { for: `r-${k}` }, h('span', null, shown(fields[k].label)), control(k, k === 'numbers' ? { ...fields[k], type: 'long' } : fields[k], '', 'r-')))));
  const refresh = () => {
    const list = rows('reports');
    const mine = list.find((r) => r.owner === state.meta.me && r.date === today());
    if (!dirty) keys.forEach((k) => { form.elements.namedItem(k).value = mine?.[k] || ''; });
    const sent = dayOf('all').submitted;
    fill(status, h('div', { class: 'row' }, team().map((u) => h('span', { class: 'row' }, avatar(u.login), u.name, h('span', { class: `tag${sent.includes(u.login) ? ' ok' : ''}` }, sent.includes(u.login) ? L('сдан', 'sent') : L('ждём', 'waiting')), h('span', { class: 'gap' })))));
    fill(feed, list.length ? list.slice(0, 60).map((r) => h('article', { class: 'panel report' },
      h('header', null, h('span', { class: 'row' }, avatar(r.owner), h('button', { class: 'link', type: 'button', onclick: () => openEditor('reports', r) }, person(r.owner))), h('span', { class: 'tag' }, short(r.date))),
      h('div', { class: 'pad two' }, keys.filter((k) => r[k]).map((k) => h('p', null, h('b', null, shown(fields[k].label)), r[k])))))
      : h('div', { class: 'panel' }, h('p', { class: 'empty' }, L('Отчётов пока нет. Первый можно заполнить прямо здесь.', 'No reports yet. You can fill in the first one right here.'))));
  };
  refresh();
  return { nodes: [header(L('Отчёты дня', 'Daily reports'), L('Что сделано, цифры, что мешает, план на завтра', 'Done, numbers, blockers, plan for tomorrow')), status, form, feed], refresh };
}

function historyPage() {
  const body = h('section', { class: 'panel list' });
  const refresh = async () => {
    try {
      const entries = await api('activity?limit=150');
      fill(body, entries.length ? entries.map((a) => h('div', { class: 'line' }, avatar(a.user),
        h('div', { class: 'name' }, h('span', null, a.summary.replace(/ · ([^·]+)$/, (_, status) => ` · ${shown(status)}`)), h('div', { class: 'sub' }, `${person(a.user)} ${shown(a.action)} · ${shown(resource(a.resource).label)}`)),
        h('div', { class: 'right' }, h('span', { class: 'num muted' }, when(a.at)))))
        : h('p', { class: 'empty' }, L('Здесь появятся изменения команды.', 'Team changes will appear here.')));
    } catch (error) { toast(error.message); }
  };
  refresh();
  return { nodes: [header(L('История', 'History'), L('Кто и что менял', 'Who changed what')), body], refresh };
}

function settingsPage() {
  const body = h('div');
  const paint = async () => {
    let me;
    try { me = await api('me'); } catch (error) { toast(error.message); return; }
    const copyRow = (label, value) => h('div', { class: 'copy' },
      h('label', null, h('span', null, label), h('input', { readOnly: true, value, type: 'password', onfocus: (e) => { e.target.type = 'text'; e.target.select(); }, onblur: (e) => { e.target.type = 'password'; } })),
      h('button', { type: 'button', onclick: () => navigator.clipboard.writeText(value).then(() => toast(L('Скопировано', 'Copied')), () => toast(L('Не получилось скопировать', 'Could not copy'))) }, L('Копировать', 'Copy')));
    const chat = h('input', { id: 'chat', inputMode: 'numeric', value: me.telegram_chat_id ?? '', placeholder: L('например 123456789', 'for example 123456789') });
    const local = ['localhost', '127.0.0.1'].includes(location.hostname);
    const panel = (title, ...children) => h('section', { class: 'panel' }, h('header', null, h('h2', null, title)), h('div', { class: 'pad stack' }, children));
    fill(body,
      panel(L('Мой Claude', 'My Claude'), h('p', null, L('Claude → Settings → Connectors → Add custom connector. Вставьте адрес и спросите: «что у меня сегодня».', 'Claude → Settings → Connectors → Add custom connector. Paste the address and ask: "what is on today".')),
        copyRow(L('Адрес коннектора (личный, никому не пересылать)', 'Connector address (personal, do not forward)'), me.claude_url),
        local ? h('p', { class: 'notice' }, L('Сейчас штаб работает только на этом компьютере. claude.ai и телефон увидят его после публикации на сервере.', 'The headquarters runs only on this computer now. claude.ai and your phone will see it once it is published on a server.')) : null),
      panel(L('Календарь на телефоне', 'Calendar on your phone'), h('p', null, L('Google Календарь → Другие календари → Добавить по URL.', 'Google Calendar → Other calendars → Add by URL.')), copyRow(L('Ссылка на подписку', 'Subscription link'), me.calendar_url)),
      panel(L('Уведомления в Telegram', 'Telegram notifications'), h('p', { class: 'muted' }, me.telegram_enabled ? L('Бот подключён.', 'The bot is connected.') : L('Бот на сервере ещё не подключён.', 'The bot is not connected on the server yet.')),
        h('label', { for: 'chat' }, h('span', null, L('Мой chat id', 'My chat id')), chat),
        h('button', { class: 'primary', type: 'button', onclick: async () => { try { await api('me', { method: 'PATCH', body: { telegram_chat_id: chat.value } }); toast(L('Сохранено', 'Saved')); } catch (error) { toast(error.message); } } }, L('Сохранить', 'Save'))),
      h('div', null, h('button', { type: 'button', onclick: switchLanguage }, LANG === 'en' ? 'Русский' : 'English')),
      h('div', null, h('button', { class: 'danger', type: 'button', onclick: logout }, L('Выйти', 'Sign out'))));
  };
  paint();
  // Not repainted on background reloads, so typing is never interrupted.
  return { nodes: [header(L('Claude и настройки', 'Claude and settings'), L('Подключения этого участника', 'This member\'s connections')), body], refresh: () => {} };
}

function morePage() {
  const body = h('div', null, h('section', { class: 'panel list' }, PAGES.filter((p) => !p[3]).map(([id, label]) => h('a', { href: `#${id}`, class: 'line' }, icon(id === 'settings' ? 'claude' : id), h('div', { class: 'name' }, label)))));
  return { nodes: [header(L('Ещё', 'More')), body], refresh: () => {} };
}

/* ---------- frame ---------- */

// id, label, sidebar group, shown in the phone bar
const PAGES = [['today', L('Сегодня', 'Today'), 'work', true], ['tasks', L('Задачи', 'Tasks'), 'work', true], ['leads', 'CRM', 'work', true], ['events', L('Календарь', 'Calendar'), 'work', true],
  ['reports', L('Отчёты', 'Reports'), 'team', false], ['content', L('Контент', 'Content'), 'team', false], ['ideas', L('Идеи', 'Ideas'), 'team', false], ['history', L('История', 'History'), 'team', false], ['settings', L('Настройки', 'Settings'), 'team', false]];

const VIEWS = {
  today: todayPage, tasks: () => boardPage('tasks'), leads: () => boardPage('leads'), events: eventsPage, reports: reportsPage,
  content: () => boardPage('content'), ideas: () => boardPage('ideas'), history: historyPage, settings: settingsPage, more: morePage,
};
const current = () => (Object.hasOwn(VIEWS, location.hash.slice(1)) ? location.hash.slice(1) : 'today');
const counts = {};

function paintChrome() {
  for (const name of ['tasks', 'leads']) {
    if (counts[name]) counts[name].textContent = String(rows(name).filter((x) => isOpen(name, x)).length || '');
  }
}

function frame(page, content) {
  const link = ([id, label, , phone]) => {
    const count = h('span', { class: 'count' });
    if (id === 'tasks' || id === 'leads') counts[id] = count;
    return h('a', { href: `#${id}`, class: [id === page ? 'active' : '', phone ? '' : 'desk'].join(' ').trim(), 'aria-current': id === page ? 'page' : null },
      icon(id === 'settings' ? 'claude' : id), h('span', null, label), count);
  };
  const inMore = page === 'more' || PAGES.some((p) => p[0] === page && !p[3]);
  root.replaceChildren(
    h('nav', { 'aria-label': L('Разделы', 'Sections') },
      h('span', { class: 'brand' }, h('b', null, 'H'), 'Team HQ'),
      h('button', { type: 'button', class: 'ask', onclick: () => { location.hash = 'settings'; } }, icon('claude'), L('Подключить Claude', 'Connect Claude')),
      PAGES.filter((p) => p[2] === 'work').map(link), h('span', { class: 'nav-label' }, L('Команда', 'Team')), PAGES.filter((p) => p[2] === 'team').map(link),
      h('a', { href: '#more', class: `only-phone${inMore ? ' active' : ''}` }, icon('more'), h('span', null, L('Ещё', 'More'))),
      h('button', { type: 'button', class: 'lang', onclick: switchLanguage }, LANG === 'en' ? 'Русский' : 'English'),
      h('div', { class: 'me' }, avatar(state.meta.me), h('b', null, person(state.meta.me)))),
    h('main', null, content));
}

function login() {
  const input = h('input', { id: 'key', type: 'password', placeholder: 'hq_…', autocomplete: 'current-password', required: true, 'aria-label': L('Ключ доступа', 'Access key') });
  root.replaceChildren(h('form', {
    class: 'login panel pad',
    onsubmit: (event) => {
      event.preventDefault();
      state.key = input.value.trim();
      storage.set(state.key);
      render();
    },
  }, h('h1', null, 'Team HQ'), h('button', { type: 'button', class: 'ghost', onclick: switchLanguage }, LANG === 'en' ? 'Русский' : 'English'), h('p', { class: 'muted' }, L('Вставьте свой ключ доступа.', 'Paste your access key.')), input, h('button', { class: 'primary', type: 'submit' }, L('Войти', 'Sign in'))));
}

let turn = 0;
async function render() {
  const mine = ++turn;
  if (!state.key) return login();
  const page = current();
  try {
    await load();
    if (mine !== turn) return;
    view = VIEWS[page]();
    frame(page, view.nodes);
    paintChrome();
  } catch (error) {
    if (state.key) toast(error.message);
  }
}

// An invite link looks like /#key=hq_… The key is saved and removed from the address bar.
function takeInvite() {
  const match = location.hash.match(/^#key=(hq_[a-f0-9]+)$/);
  if (!match) return;
  [, state.key] = match;
  storage.set(state.key);
  history.replaceState(null, '', '/#today');
}

window.addEventListener('hashchange', () => { takeInvite(); state.query = ''; render(); window.scrollTo(0, 0); });
// Pick up changes made by teammates when the page comes back into view.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.key && view && !editor.open) reload().catch((error) => toast(error.message));
});
takeInvite();
render();
