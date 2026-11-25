// Fills an empty database with invented demo data. Never use it on a real one.
// Then start it with: npm start -- data/demo.db
import { fileURLToPath } from 'node:url';
import { L } from '../public/i18n.js';
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
  { title: L('Отправить предложение онлайн-школе', 'Send a proposal to the online school'), owner: 'anna', priority: 'P0', status: 'В работе', due: addDays(day, -1), result: L('Письмо отправлено, назначен звонок', 'Email sent, call scheduled') },
  { title: L('Провести 3 демо кабинета', 'Run 3 cabinet demos'), owner: 'anna', priority: 'P1', due: addDays(day, 2) },
  { title: L('Принять тестовые ролики авторов', 'Review test videos from creators'), owner: 'boris', priority: 'P0', status: 'В работе', due: day },
  { title: L('Записать обучающее видео', 'Record a tutorial video'), owner: 'boris', priority: 'P2', due: addDays(day, 5) },
  { title: L('Подключить оплату на сайте', 'Connect payments on the site'), owner: 'dana', priority: 'P0', status: 'Заблокировано', due: addDays(day, 1), note: L('Ждём документы от банка', 'Waiting for bank documents') },
  { title: L('Настроить резервные копии', 'Set up backups'), owner: 'dana', priority: 'P1', status: 'Выполнено', due: addDays(day, -3) },
  { title: L('Обновить презентацию', 'Update the presentation'), owner: 'anna', priority: 'P1', status: 'На проверке', due: addDays(day, 3) },
]);
await add('leads', [
  { company: 'North School', status: 'Диалог', owner: 'anna', channel: 'Instagram', next_step: L('Позвонить', 'Call'), next_date: day, amount: 1000 },
  { company: 'Lumen Beauty', status: 'Контакт', owner: 'anna', channel: 'WhatsApp', next_step: L('Напомнить', 'Remind'), next_date: addDays(day, 2) },
  { company: 'Pixel Games', status: 'КП / Счёт', owner: 'boris', channel: 'Email', next_step: L('Уточнить оплату', 'Check the payment'), next_date: addDays(day, 1), amount: 500 },
  { company: 'Green Market', status: 'Оплачено', owner: 'anna', channel: 'Ивент', amount: 1000 },
]);
await add('events', [
  { title: L('Вечерний синк', 'Evening sync'), date: day, time: '21:00', type: 'Синк', owner: 'anna', place: 'Zoom' },
  { title: L('Демо-день', 'Demo day'), date: addDays(day, 4), time: '15:00', type: 'Ивент', owner: 'boris', place: L('Астана', 'Astana') },
]);
await add('reports', [{ owner: 'dana', done: L('Починила очередь просмотров', 'Fixed the views queue'), numbers: L('3 исправления', '3 fixes'), blockers: L('Банк не ответил', 'The bank has not replied'), plan: L('Тестовая оплата', 'Test payment') }]);
await add('content', [{ title: L('Как мы считаем просмотры', 'How we count views'), status: 'В работе', owner: 'dana', platform: 'LinkedIn', date: addDays(day, 1) }]);
await add('ideas', [{ title: L('Еженедельный разбор лучших роликов', 'Weekly review of the best videos'), status: 'Новая', owner: 'boris', category: L('Комьюнити', 'Community') }]);

console.log('Demo data added. Sign-in links:');
for (const [login, token] of Object.entries(tokens)) console.log(`  ${login}: http://localhost:8787/#key=${token}`);
db.close();
