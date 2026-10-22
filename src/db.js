'use strict';
// SQLite via Node's built-in node:sqlite (no native deps).
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'dashboard.db');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS bds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  commission_pct REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS affiliates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,          -- promo/referral code shown to customer (e.g. XYZCUPB1F1)
  referral_id TEXT,                   -- platform referral id (register?referral=NNNN)
  name TEXT NOT NULL,
  bd_id INTEGER REFERENCES bds(id) ON DELETE SET NULL,
  commission_pct REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','bd','affiliate')),
  bd_id INTEGER REFERENCES bds(id) ON DELETE SET NULL,
  affiliate_id INTEGER REFERENCES affiliates(id) ON DELETE SET NULL,
  must_change_pw INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ext_id TEXT UNIQUE,                 -- id from the source system (idempotent import)
  affiliate_id INTEGER REFERENCES affiliates(id) ON DELETE SET NULL,
  referral_code TEXT,                 -- raw code/referral captured on the order
  amount REAL NOT NULL DEFAULT 0,     -- gross sale amount (USD)
  product TEXT,                       -- e.g. "100K Account", "Z Mode - Hard"
  account_size TEXT,
  mode TEXT,
  status TEXT NOT NULL DEFAULT 'paid',-- paid | refunded | pending
  customer_email TEXT,
  created_at TEXT NOT NULL            -- ISO date of the sale
);

CREATE TABLE IF NOT EXISTS signups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ext_id TEXT UNIQUE,
  affiliate_id INTEGER REFERENCES affiliates(id) ON DELETE SET NULL,
  referral_code TEXT,
  email TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sales_aff ON sales(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_aff_bd ON affiliates(bd_id);
CREATE INDEX IF NOT EXISTS idx_signups_aff ON signups(affiliate_id);
`);

module.exports = db;
