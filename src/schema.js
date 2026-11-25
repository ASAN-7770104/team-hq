// One description of every table. The database, validation, REST API,
// MCP tools and the forms in the browser are all built from this file.

const text = (label, extra = {}) => ({ type: 'text', label, ...extra });
const long = (label) => ({ type: 'long', label });
const date = (label, extra = {}) => ({ type: 'date', label, ...extra });
const num = (label) => ({ type: 'number', label });
const user = (label = 'Ответственный', extra = {}) => ({ type: 'user', label, ...extra });
const choice = (label, options, extra = {}) => ({ type: 'enum', label, options, default: options[0], ...extra });

export const resources = {
  tasks: {
    label: 'Задачи',
    title: 'title',
    order: "due IS NULL, due, priority, id",
    closed: ['Выполнено', 'Заморожено'],
    fields: {
      title: text('Задача', { required: true }),
      code: text('Код'),
      owner: user(),
      status: choice('Статус', ['План', 'В работе', 'На проверке', 'Заблокировано', 'Выполнено', 'Заморожено']),
      priority: choice('Приоритет', ['P0', 'P1', 'P2'], { default: 'P1' }),
      due: date('Срок'),
      result: long('Готово, когда'),
      details: long('Как делается'),
      note: long('Последний апдейт'),
    },
  },
  leads: {
    label: 'CRM',
    title: 'company',
    order: "next_date IS NULL, next_date, id",
    closed: ['Оплачено', 'Отказ'],
    fields: {
      company: text('Компания', { required: true }),
      status: choice('Статус', ['План', 'Контакт', 'В работе', 'Диалог', 'Созвон', 'КП / Счёт', 'Оплачено', 'Отказ']),
      owner: user(),
      channel: text('Канал'),
      contact: text('Контакт'),
      next_step: text('Следующий шаг'),
      next_date: date('Дата шага'),
      amount: num('Сумма сделки'),
      note: long('Заметки'),
    },
  },
  events: {
    label: 'Календарь',
    title: 'title',
    order: "date, time, id",
    fields: {
      title: text('Событие', { required: true }),
      date: date('Дата', { required: true }),
      time: { type: 'time', label: 'Время' },
      type: choice('Тип', ['Встреча', 'Синк', 'Созвон', 'Ивент', 'Дедлайн']),
      owner: user('Кто ведёт'),
      place: text('Место или ссылка'),
      note: long('Подготовка'),
    },
  },
  reports: {
    label: 'Отчёты дня',
    title: 'date',
    order: 'date DESC, id DESC',
    unique: ['owner', 'date'],
    fields: {
      date: date('Дата', { required: true, today: true }),
      owner: user('Кто', { required: true, self: true }),
      done: long('Что сделано'),
      numbers: text('Цифры дня'),
      blockers: long('Что мешает'),
      plan: long('План на завтра'),
    },
  },
  content: {
    label: 'Контент',
    title: 'title',
    order: "date IS NULL, date, id",
    closed: ['Опубликовано'],
    fields: {
      title: text('Пост или ролик', { required: true }),
      status: choice('Статус', ['Идея', 'В работе', 'Готово', 'Опубликовано']),
      owner: user(),
      platform: text('Площадка'),
      date: date('Дата выхода'),
      url: { type: 'url', label: 'Ссылка' },
      views: num('Просмотры'),
      note: long('Текст и заметки'),
    },
  },
  ideas: {
    label: 'Идеи',
    title: 'title',
    order: 'id DESC',
    closed: ['Отклонена'],
    fields: {
      title: text('Идея', { required: true }),
      status: choice('Статус', ['Новая', 'Берём', 'Отложена', 'Отклонена']),
      owner: user('Автор'),
      category: text('Категория'),
      note: long('Описание'),
    },
  },
};

const sqlType = (field) => (field.type === 'number' ? 'REAL' : 'TEXT');

export function schemaSql() {
  const tables = Object.entries(resources).map(([name, res]) => {
    const columns = Object.entries(res.fields).map(([key, field]) => `  ${key} ${sqlType(field)}`);
    const unique = res.unique ? [`  UNIQUE (${res.unique.join(', ')})`] : [];
    return `CREATE TABLE IF NOT EXISTS ${name} (\n${[
      '  id INTEGER PRIMARY KEY AUTOINCREMENT',
      ...columns,
      '  archived INTEGER NOT NULL DEFAULT 0',
      '  created_at TEXT NOT NULL',
      '  updated_at TEXT NOT NULL',
      '  updated_by TEXT',
      ...unique,
    ].join(',\n')}\n);`;
  });
  return [
    '-- Generated from src/schema.js (npm run schema). Do not edit by hand.',
    `CREATE TABLE IF NOT EXISTS users (
  login TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT,
  token_hash TEXT NOT NULL UNIQUE,
  telegram_chat_id TEXT,
  created_at TEXT NOT NULL
);`,
    `CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  user TEXT NOT NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  summary TEXT NOT NULL
);`,
    ...tables,
  ].join('\n\n') + '\n';
}
