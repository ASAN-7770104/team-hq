-- Generated from src/schema.js (npm run schema). Do not edit by hand.

CREATE TABLE IF NOT EXISTS users (
  login TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT,
  token_hash TEXT NOT NULL UNIQUE,
  telegram_chat_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  user TEXT NOT NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  summary TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  code TEXT,
  owner TEXT,
  status TEXT,
  priority TEXT,
  due TEXT,
  result TEXT,
  details TEXT,
  note TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company TEXT,
  status TEXT,
  owner TEXT,
  channel TEXT,
  contact TEXT,
  next_step TEXT,
  next_date TEXT,
  amount REAL,
  note TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  date TEXT,
  time TEXT,
  type TEXT,
  owner TEXT,
  place TEXT,
  note TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT,
  owner TEXT,
  done TEXT,
  numbers TEXT,
  blockers TEXT,
  plan TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  UNIQUE (owner, date)
);

CREATE TABLE IF NOT EXISTS content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  status TEXT,
  owner TEXT,
  platform TEXT,
  date TEXT,
  url TEXT,
  views REAL,
  note TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS ideas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  status TEXT,
  owner TEXT,
  category TEXT,
  note TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);
