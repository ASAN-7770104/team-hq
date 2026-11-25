// Fills an empty database with invented demo data. Never use it on a real one.
// Then start it with: npm start -- data/demo.db
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../server/sqlite.js';
import { addUser } from '../src/auth.js';
import { create, team } from '../src/core.js';
import { today, addDays } from '../src/time.js';

const demo = fileURLToPath(new URL('../data/demo.db', import.meta.url));
const db = openDatabase(process.env.HQ_DB || demo);
if ((await team(db)).length) {
  console.error('The database is not empty, nothing was added.');
  process.exit(1);
}

const people = [
  { login: 'anna', name: 'Anna', role: 'CEO' },
  { login: 'boris', name: 'Boris', role: 'COO' },
  { login: 'dana', name: 'Dana', role: 'CTO' },
];
const tokens = {};
for (const person of people) tokens[person.login] = await addUser(db, person);

const env = {};
const ctx = { db, env, user: { login: 'anna', name: 'Anna' } };
const day = today(env);
const add = (table, rows) => rows.reduce((chain, row) => chain.then(() => create(ctx, table, row)), Promise.resolve());

await add('tasks', [
  { title: 'Отправить предложение онлайн-школе', owner: 'anna', priority: 'P0', status: 'В работе', due: addDays(day, -1), result: 'Письмо отправлено, назначен звонок' },
  { title: 'Провести 3 демо кабинета', owner: 'anna', priority: 'P1', due: addDays(day, 2) },
  { title: 'Принять тестовые ролики авторов', owner: 'boris', priority: 'P0', status: 'В работе', due: day },
  { title: 'Записать обучающее видео', owner: 'boris', priority: 'P2', due: addDays(day, 5) },
  { title: 'Подключить оплату на сайте', owner: 'dana', priority: 'P0', status: 'Заблокировано', due: addDays(day, 1), note: 'Ждём документы от банка' },
  { title: 'Настроить резервные копии', owner: 'dana', priority: 'P1', status: 'Выполнено', due: addDays(day, -3) },
  { title: 'Обновить презентацию', owner: 'anna', priority: 'P1', status: 'На проверке', due: addDays(day, 3) },
]);
await add('leads', [
  { company: 'North School', status: 'Диалог', owner: 'anna', channel: 'Instagram', next_step: 'Позвонить', next_date: day, amount: 1000 },
  { company: 'Lumen Beauty', status: 'Контакт', owner: 'anna', channel: 'WhatsApp', next_step: 'Напомнить', next_date: addDays(day, 2) },
  { company: 'Pixel Games', status: 'КП / Счёт', owner: 'boris', channel: 'Email', next_step: 'Уточнить оплату', next_date: addDays(day, 1), amount: 500 },
  { company: 'Green Market', status: 'Оплачено', owner: 'anna', channel: 'Ивент', amount: 1000 },
]);
await add('events', [
  { title: 'Вечерний синк', date: day, time: '21:00', type: 'Синк', owner: 'anna', place: 'Zoom' },
  { title: 'Демо-день', date: addDays(day, 4), time: '15:00', type: 'Ивент', owner: 'boris', place: 'Астана' },
]);
await add('reports', [{ owner: 'dana', done: 'Починила очередь просмотров', numbers: '3 исправления', blockers: 'Банк не ответил', plan: 'Тестовая оплата' }]);
await add('content', [{ title: 'Как мы считаем просмотры', status: 'В работе', owner: 'dana', platform: 'LinkedIn', date: addDays(day, 1) }]);
await add('ideas', [{ title: 'Еженедельный разбор лучших роликов', status: 'Новая', owner: 'boris', category: 'Комьюнити' }]);

console.log('Demo data added. Sign-in links:');
for (const [login, token] of Object.entries(tokens)) console.log(`  ${login}: http://localhost:8787/#key=${token}`);
db.close();
