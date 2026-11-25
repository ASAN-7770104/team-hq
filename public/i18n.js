// Two languages. Statuses and types are stored once, in their original Russian form, so existing records keep
// working; shown() translates them (and the table and field names) on the way to the screen.
function pick() {
  if (typeof process !== 'undefined' && process.env) return process.env.HQ_LANG === 'en' ? 'en' : 'ru';
  if (typeof localStorage === 'undefined' && typeof location === 'undefined') return 'ru';
  let wanted;
  try {
    wanted = new URLSearchParams(location.search).get('lang') || localStorage.getItem('hq_lang');
  } catch {
    // Storage can be blocked: use the browser language.
  }
  if (wanted === 'ru' || wanted === 'en') return wanted;
  return /^(ru|kk|be|uk)/i.test(globalThis.navigator?.language ?? '') ? 'ru' : 'en';
}

export let LANG = pick();
// Cloudflare has no process.env: the worker passes its setting in.
export function setLanguage(next) {
  if (next === 'ru' || next === 'en') LANG = next;
}
export const L = (ru, en) => (LANG === 'en' ? en : ru);

const ENGLISH = {
  // tables and fields
  Задачи: 'Tasks', CRM: 'CRM', Календарь: 'Calendar', 'Отчёты дня': 'Daily reports', Контент: 'Content', Идеи: 'Ideas',
  Задача: 'Task', Код: 'Code', Ответственный: 'Owner', Статус: 'Status', Приоритет: 'Priority', Срок: 'Due', 'Готово, когда': 'Done when', 'Как делается': 'How', 'Последний апдейт': 'Latest update',
  Компания: 'Company', Канал: 'Channel', Контакт: 'Contact', 'Следующий шаг': 'Next step', 'Дата шага': 'Step date', 'Сумма сделки': 'Deal amount', Заметки: 'Notes',
  Событие: 'Event', Дата: 'Date', Время: 'Time', Тип: 'Type', 'Кто ведёт': 'Host', 'Место или ссылка': 'Place or link', Подготовка: 'Preparation',
  Кто: 'Who', 'Что сделано': 'Done', 'Цифры дня': 'Numbers', 'Что мешает': 'Blockers', 'План на завтра': 'Plan for tomorrow',
  'Пост или ролик': 'Post or video', Площадка: 'Platform', 'Дата выхода': 'Publish date', Ссылка: 'Link', Просмотры: 'Views', 'Текст и заметки': 'Text and notes',
  Идея: 'Idea', Автор: 'Author', Категория: 'Category', Описание: 'Description',
  // stored values
  План: 'Planned', 'В работе': 'In progress', 'На проверке': 'In review', Заблокировано: 'Blocked', Выполнено: 'Done', Заморожено: 'On hold',
  Диалог: 'In talks', Созвон: 'Call', 'КП / Счёт': 'Offer / invoice', Оплачено: 'Paid', Отказ: 'Declined',
  Встреча: 'Meeting', Синк: 'Sync', Ивент: 'Event', Дедлайн: 'Deadline',
  Готово: 'Ready', Опубликовано: 'Published', Новая: 'New', Берём: 'Taking it', Отложена: 'Postponed', Отклонена: 'Rejected',
  // history and server messages
  добавил: 'added', изменил: 'changed', 'убрал в архив': 'archived', 'Такая запись уже есть': 'This record already exists', 'Нужен ключ доступа': 'An access key is required',
};

export const shown = (value) => (LANG === 'en' && Object.hasOwn(ENGLISH, value) ? ENGLISH[value] : value);

export function switchLanguage() {
  const next = LANG === 'en' ? 'ru' : 'en';
  try {
    localStorage.setItem('hq_lang', next);
  } catch {
    // The address carries the choice instead.
  }
  const url = new URL(location.href);
  url.searchParams.set('lang', next);
  location.replace(url);
}
