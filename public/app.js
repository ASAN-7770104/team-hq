const root = document.querySelector('#app');
const editor = document.querySelector('#editor');
const toastBox = document.querySelector('#toast');

const storage = {
  get: () => { try { return localStorage.getItem('hq_key'); } catch { return null; } },
  set: (v) => { try { v ? localStorage.setItem('hq_key', v) : localStorage.removeItem('hq_key'); } catch { /* private mode */ } },
};

const state = { key: storage.get(), meta: null, owner: '', todayOwner: '', query: '', openOnly: true };

// DOM helper. Text always goes in as text, never as HTML.
function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (name.startsWith('on')) node.addEventListener(name.slice(2), value);
    else if (name === 'class') node.className = value;
    else if (name in node && name !== 'list') node[name] = value;
    else node.setAttribute(name, value);
  }
  node.append(...children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}

function toast(message) {
  toastBox.textContent = message;
  toastBox.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => toastBox.classList.remove('show'), 3500);
}

async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(`/api/${path}`, {
    method,
    headers: { authorization: `Bearer ${state.key}`, 'content-type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) { logout(); throw new Error('Ключ не подошёл'); }
  if (!response.ok) throw new Error(data.error || 'Ошибка сервера');
  return data;
}

function logout() {
  state.key = null;
  state.meta = null;
  storage.set(null);
  render();
}

const person = (login) => state.meta.team.find((u) => u.login === login)?.name ?? login ?? '—';
const shortDate = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : '');

const PAGES = [
  ['today', 'Сегодня', '☀️'], ['tasks', 'Задачи', '✅'], ['leads', 'CRM', '🤝'], ['events', 'Календарь', '📅'],
  ['reports', 'Отчёты', '📝'], ['content', 'Контент', '🎬'], ['ideas', 'Идеи', '💡'],
  ['activity', 'История', '🕘'], ['settings', 'Настройки', '⚙️'],
];

function login() {
  const input = h('input', { type: 'password', placeholder: 'hq_…', autocomplete: 'current-password', required: true });
  const form = h('form', {
    class: 'login card',
    onsubmit: (event) => {
      event.preventDefault();
      state.key = input.value.trim();
      storage.set(state.key);
      render();
    },
  },
  h('h1', {}, 'Team HQ'),
  h('p', { class: 'muted' }, 'Вставьте свой ключ доступа.'),
  input,
  h('button', { class: 'primary' }, 'Войти'));
  root.replaceChildren(form);
}

function shell(page, content) {
  const link = ([id, label, icon]) =>
    h('a', { href: `#${id}`, class: id === page ? 'active' : '' }, h('span', { class: 'icon' }, icon), h('span', {}, label));
  root.replaceChildren(
    h('nav', {}, h('strong', { class: 'brand' }, 'Team HQ'), PAGES.map(link)),
    h('main', {}, content),
  );
}

const header = (title, ...actions) => h('header', {}, h('h1', {}, title), h('div', { class: 'actions' }, actions));

function chips(current, options, pick) {
  return h('div', { class: 'chips' }, options.map(([value, label]) =>
    h('button', { class: value === current ? 'chip active' : 'chip', type: 'button', onclick: () => pick(value) }, label)));
}

const owners = () => state.meta.team.map((u) => [u.login, u.login === state.meta.me ? `${u.name} (я)` : u.name]);

/* ---------- editor ---------- */

function input(key, field, value) {
  const common = { name: key, id: `f-${key}`, required: Boolean(field.required) };
  if (field.type === 'long') return h('textarea', { ...common, rows: 3, maxLength: 5000 }, value ?? '');
  if (field.type === 'enum' || field.type === 'user') {
    const options = field.type === 'enum' ? field.options.map((o) => [o, o]) : [['', '—'], ...owners()];
    const select = h('select', common, options.map(([v, label]) => h('option', { value: v }, label)));
    select.value = value ?? '';
    return select;
  }
  const type = { date: 'date', time: 'time', number: 'number', url: 'url' }[field.type] ?? 'text';
  return h('input', { ...common, type, value: value ?? '', step: type === 'number' ? 'any' : null, maxLength: type === 'text' ? 500 : null });
}

function openEditor(table, item = null) {
  const res = state.meta.resources[table];
  const defaults = {};
  for (const [key, field] of Object.entries(res.fields)) {
    if (field.default !== undefined) defaults[key] = field.default;
    if (field.today) defaults[key] = state.meta.today;
    if (field.self || (field.type === 'user' && !item)) defaults[key] = state.owner || state.meta.me;
  }
  const values = item ?? defaults;
  const form = h('form', {
    onsubmit: async (event) => {
      event.preventDefault();
      const data = {};
      for (const key of Object.keys(res.fields)) {
        const raw = form.elements[key].value;
        const before = item?.[key] ?? '';
        if (item ? String(before) !== raw : raw !== '') data[key] = raw;
      }
      try {
        if (!item) await api(table, { method: 'POST', body: data });
        else if (Object.keys(data).length) await api(`${table}/${item.id}`, { method: 'PATCH', body: data });
        editor.close();
        toast('Сохранено');
        render();
      } catch (error) { toast(error.message); }
    },
  },
  h('h2', {}, item ? 'Изменить' : `Новая запись: ${res.label}`),
  Object.entries(res.fields).map(([key, field]) =>
    h('label', { for: `f-${key}` }, h('span', {}, field.label), input(key, field, values[key]))),
  item && h('p', { class: 'muted' }, `Изменено: ${person(item.updated_by)}, ${new Date(item.updated_at).toLocaleString('ru-RU')}`),
  h('div', { class: 'buttons' },
    item && h('button', {
      type: 'button', class: 'danger',
      onclick: async () => {
        if (!confirm('Убрать запись в архив?')) return;
        try { await api(`${table}/${item.id}`, { method: 'DELETE' }); editor.close(); render(); } catch (error) { toast(error.message); }
      },
    }, 'В архив'),
    h('span', { class: 'spacer' }),
    h('button', { type: 'button', onclick: () => editor.close() }, 'Отмена'),
    h('button', { class: 'primary' }, 'Сохранить')));
  editor.replaceChildren(form);
  editor.showModal();
}

/* ---------- cards and boards ---------- */

function card(table, item, { statusPicker = false } = {}) {
  const res = state.meta.resources[table];
  const date = item.due ?? item.next_date ?? item.date;
  const closed = res.closed?.includes(item.status);
  const late = date && date < state.meta.today && !closed && (item.due || item.next_date);
  const subtitle = item.next_step ?? item.platform ?? item.category ?? item.place ?? null;
  let picker = null;
  if (statusPicker) {
    picker = h('select', {
      class: 'status', 'aria-label': 'Статус',
      onclick: (e) => e.stopPropagation(),
      onchange: async (e) => {
        try { await api(`${table}/${item.id}`, { method: 'PATCH', body: { status: e.target.value } }); } catch (error) { toast(error.message); }
        render();
      },
    }, res.fields.status.options.map((o) => h('option', { value: o }, o)));
    picker.value = item.status;
  }
  return h('article', { class: late ? 'item late' : 'item' },
    h('button', { class: 'title', type: 'button', onclick: () => openEditor(table, item) }, item[res.title]),
    subtitle && h('p', { class: 'muted' }, subtitle),
    h('div', { class: 'meta' },
      item.priority && h('span', { class: `badge ${item.priority}` }, item.priority),
      item.owner && h('span', { class: 'badge' }, person(item.owner)),
      date && h('span', { class: 'badge date' }, `${shortDate(date)}${item.time ? ` ${item.time}` : ''}`),
      item.amount ? h('span', { class: 'badge' }, item.amount.toLocaleString('ru-RU')) : null,
      picker));
}

async function board(table) {
  const res = state.meta.resources[table];
  const columns = h('div', { class: 'board' });
  async function load() {
    const params = new URLSearchParams();
    if (state.owner) params.set('owner', state.owner);
    if (state.query) params.set('q', state.query);
    if (state.openOnly) params.set('open', '1');
    const items = await api(`${table}?${params}`);
    const statuses = res.fields.status.options.filter((s) => !state.openOnly || !res.closed?.includes(s));
    columns.replaceChildren(...statuses.map((status) => {
      const group = items.filter((i) => i.status === status);
      return h('section', { class: group.length ? 'column' : 'column empty' },
        h('h3', {}, status, h('small', {}, String(group.length))),
        group.map((item) => card(table, item, { statusPicker: true })));
    }));
  }
  let timer;
  const search = h('input', {
    type: 'search', placeholder: 'Поиск', value: state.query,
    oninput: (e) => { state.query = e.target.value; clearTimeout(timer); timer = setTimeout(() => load().catch((x) => toast(x.message)), 250); },
  });
  await load();
  return [
    header(res.label, h('button', { class: 'primary', onclick: () => openEditor(table) }, '+ Добавить')),
    h('div', { class: 'filters' },
      chips(state.owner, [['', 'Все'], ...owners()], (v) => { state.owner = v; render(); }),
      search,
      res.closed && h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: state.openOnly, onchange: (e) => { state.openOnly = e.target.checked; render(); } }),
        'только открытые')),
    columns,
  ];
}

/* ---------- pages ---------- */

const section = (title, table, items, empty) =>
  h('section', { class: 'card' },
    h('h2', {}, title, h('small', {}, String(items.length))),
    items.length ? items.map((i) => card(table, i)) : h('p', { class: 'muted' }, empty));

async function todayPage() {
  const owner = state.todayOwner || state.meta.me;
  const day = await api(`dashboard?user=${encodeURIComponent(owner)}`);
  const stat = (label, value, tone = '') => h('div', { class: `stat ${tone}` }, h('b', {}, String(value)), h('span', {}, label));
  return [
    header(`Сегодня, ${shortDate(day.today)}`, h('button', { class: 'primary', onclick: () => openEditor('tasks') }, '+ Задача')),
    chips(owner, [...owners(), ['all', 'Вся команда']], (v) => { state.todayOwner = v; render(); }),
    h('div', { class: 'stats' },
      stat('открытых задач', day.tasks.open),
      stat('просрочено', day.tasks.overdue.length, day.tasks.overdue.length ? 'bad' : ''),
      stat('заблокировано', day.tasks.blocked.length, day.tasks.blocked.length ? 'warn' : ''),
      stat('отчётов сдано', `${day.reports.submitted.length}/${day.reports.submitted.length + day.reports.missing.length}`)),
    day.reports.missing.length ? h('p', { class: 'notice' }, `Ждём отчёт: ${day.reports.missing.map(person).join(', ')}`) : null,
    h('div', { class: 'grid' },
      section('Просрочено', 'tasks', day.tasks.overdue, 'Всё в срок.'),
      section('На сегодня', 'tasks', day.tasks.today, 'Задач на сегодня нет.'),
      section('Заблокировано', 'tasks', day.tasks.blocked, 'Блокеров нет.'),
      section('В работе', 'tasks', day.tasks.in_progress, 'Ничего не взято в работу.'),
      section('Шаги по лидам', 'leads', day.leads_due, 'Срочных шагов нет.'),
      section('События на 7 дней', 'events', day.events, 'Событий нет.')),
  ];
}

async function eventsPage() {
  const events = await api('events?limit=1000');
  const upcoming = events.filter((e) => e.date >= state.meta.today);
  const past = events.filter((e) => e.date < state.meta.today).reverse();
  const group = (list) => {
    const days = [...new Set(list.map((e) => e.date))];
    return days.map((d) => h('section', { class: 'card' },
      h('h2', {}, new Date(`${d}T00:00:00`).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })),
      list.filter((e) => e.date === d).map((e) => card('events', e))));
  };
  return [
    header('Календарь', h('button', { class: 'primary', onclick: () => openEditor('events') }, '+ Событие')),
    upcoming.length ? group(upcoming) : h('p', { class: 'muted' }, 'Впереди событий нет.'),
    past.length ? h('details', {}, h('summary', {}, `Прошедшие (${past.length})`), group(past)) : null,
  ];
}

async function reportsPage() {
  const reports = await api('reports?limit=100');
  const mine = reports.find((r) => r.owner === state.meta.me && r.date === state.meta.today);
  const fields = state.meta.resources.reports.fields;
  const keys = ['done', 'numbers', 'blockers', 'plan'];
  const form = h('form', {
    class: 'card',
    onsubmit: async (event) => {
      event.preventDefault();
      const body = Object.fromEntries(keys.map((k) => [k, form.elements[k].value]));
      try {
        if (mine) await api(`reports/${mine.id}`, { method: 'PATCH', body });
        else await api('reports', { method: 'POST', body });
        toast('Отчёт сохранён');
        render();
      } catch (error) { toast(error.message); }
    },
  },
  h('h2', {}, mine ? 'Мой отчёт за сегодня (сдан)' : 'Мой отчёт за сегодня'),
  keys.map((k) => h('label', { for: `f-${k}` }, h('span', {}, fields[k].label), input(k, fields[k], mine?.[k]))),
  h('button', { class: 'primary' }, 'Сохранить'));
  return [
    header('Отчёты дня'),
    form,
    reports.map((r) => h('article', { class: 'card report' },
      h('button', { class: 'title', type: 'button', onclick: () => openEditor('reports', r) }, `${person(r.owner)} · ${shortDate(r.date)}`),
      keys.filter((k) => r[k]).map((k) => h('p', {}, h('b', {}, `${fields[k].label}: `), r[k])))),
  ];
}

async function activityPage() {
  const rows = await api('activity?limit=150');
  return [
    header('История изменений'),
    h('section', { class: 'card feed' }, rows.length
      ? rows.map((a) => h('p', {},
        h('b', {}, person(a.user)), ` ${a.action} · ${state.meta.resources[a.resource].label}: ${a.summary} `,
        h('small', { class: 'muted' }, new Date(a.at).toLocaleString('ru-RU'))))
      : h('p', { class: 'muted' }, 'Пока пусто.')),
  ];
}

async function settingsPage() {
  const me = await api('me');
  const copyRow = (label, value) => h('div', { class: 'copy' },
    h('label', {}, h('span', {}, label), h('input', { readOnly: true, value, type: 'password', onfocus: (e) => { e.target.type = 'text'; e.target.select(); }, onblur: (e) => { e.target.type = 'password'; } })),
    h('button', {
      type: 'button',
      onclick: () => navigator.clipboard.writeText(value).then(() => toast('Скопировано'), () => toast('Не получилось скопировать')),
    }, 'Копировать'));
  const chat = h('input', { inputMode: 'numeric', value: me.telegram_chat_id ?? '', placeholder: 'например 123456789' });
  return [
    header('Настройки'),
    h('section', { class: 'card' },
      h('h2', {}, 'Мой Claude'),
      h('p', {}, 'Claude → Settings → Connectors → Add custom connector. Вставьте этот адрес и спросите: «что у меня сегодня».'),
      copyRow('Адрес коннектора (личный, никому не пересылать)', me.claude_url),
      location.hostname === 'localhost' || location.hostname === '127.0.0.1'
        ? h('p', { class: 'notice' }, 'Сейчас штаб работает только на этом компьютере. claude.ai и телефон увидят его после публикации на сервере.') : null),
    h('section', { class: 'card' },
      h('h2', {}, 'Календарь на телефоне'),
      h('p', {}, 'Google Календарь → Другие календари → Добавить по URL.'),
      copyRow('Ссылка на подписку', me.calendar_url)),
    h('section', { class: 'card' },
      h('h2', {}, 'Уведомления в Telegram'),
      h('p', { class: 'muted' }, me.telegram_enabled ? 'Бот подключён.' : 'Бот на сервере ещё не подключён.'),
      h('label', {}, h('span', {}, 'Мой chat id'), chat),
      h('button', {
        class: 'primary', type: 'button',
        onclick: async () => {
          try { await api('me', { method: 'PATCH', body: { telegram_chat_id: chat.value } }); toast('Сохранено'); } catch (error) { toast(error.message); }
        },
      }, 'Сохранить')),
    h('button', { class: 'danger', type: 'button', onclick: logout }, 'Выйти'),
  ];
}

const views = {
  today: todayPage, tasks: () => board('tasks'), leads: () => board('leads'), events: eventsPage,
  reports: reportsPage, content: () => board('content'), ideas: () => board('ideas'),
  activity: activityPage, settings: settingsPage,
};

let turn = 0;
async function render() {
  const mine = ++turn;
  if (!state.key) return login();
  const hash = location.hash.slice(1);
  const page = Object.hasOwn(views, hash) ? hash : 'today';
  try {
    state.meta = await api('meta');
    const content = await views[page]();
    if (mine === turn) shell(page, content);
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

window.addEventListener('hashchange', () => { takeInvite(); state.query = ''; render(); });
// Pick up changes made by teammates when the page comes back into view.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.key && !editor.open && location.hash !== '#reports' && location.hash !== '#settings') render();
});
takeInvite();
render();
