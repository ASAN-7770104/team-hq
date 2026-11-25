// Writes the local database as SQL so it can be loaded into Cloudflare D1:
//   npm run export -- data/export.sql
//   npx wrangler d1 execute team-hq --remote --file data/export.sql
// The file contains your real data. Keep it out of Git.
import { writeFileSync } from 'node:fs';
import { openDatabase } from '../server/sqlite.js';
import { resources, schemaSql } from '../src/schema.js';

const target = process.argv[2];
if (!target) {
  console.error('Usage: npm run export -- data/export.sql');
  process.exit(1);
}

const db = openDatabase();
const quote = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replaceAll("'", "''")}'`;
};

const out = [schemaSql()];
for (const table of ['users', 'activity', ...Object.keys(resources)]) {
  const { results } = await db.prepare(`SELECT * FROM ${table}`).all();
  for (const row of results) {
    out.push(`INSERT OR REPLACE INTO ${table} (${Object.keys(row).join(', ')}) VALUES (${Object.values(row).map(quote).join(', ')});`);
  }
}
writeFileSync(target, `${out.join('\n')}\n`, 'utf8');
console.log(`${target}: ${out.length - 1} rows`);
db.close();
