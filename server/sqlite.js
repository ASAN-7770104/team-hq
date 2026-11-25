// A small adapter that gives node:sqlite the same interface as Cloudflare D1.
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { schemaSql } from '../src/schema.js';

class Statement {
  constructor(db, sql, args = []) {
    Object.assign(this, { db, sql, args });
  }

  bind(...args) {
    return new Statement(this.db, this.sql, args.map((a) => a ?? null));
  }

  async all() {
    return { results: this.db.prepare(this.sql).all(...this.args).map((row) => ({ ...row })) };
  }

  async first() {
    const row = this.db.prepare(this.sql).get(...this.args);
    return row ? { ...row } : null;
  }

  async run() {
    const info = this.db.prepare(this.sql).run(...this.args);
    return { meta: { last_row_id: Number(info.lastInsertRowid), changes: Number(info.changes) } };
  }
}

const DEFAULT_PATH = fileURLToPath(new URL('../data/hq.db', import.meta.url));

export function openDatabase(path = process.env.HQ_DB || DEFAULT_PATH) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const raw = new DatabaseSync(path);
  raw.exec(schemaSql());
  return { raw, prepare: (sql) => new Statement(raw, sql), close: () => raw.close() };
}
