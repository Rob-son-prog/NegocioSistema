// server/db.js
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

export const db = new Database('data.sqlite'); // cria na pasta /server
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin'
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  total REAL NOT NULL,
  parcelas INTEGER NOT NULL,
  first_due TEXT NOT NULL,         -- 'YYYY-MM-DD'
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS installments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  num INTEGER NOT NULL,            -- nº da parcela (1..N)
  due_date TEXT NOT NULL,          -- 'YYYY-MM-DD'
  value REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', -- open | paid
  paid_at TEXT
);
`);

// Seed opcional do admin (o login usa .env, mas deixo criado no banco também)
const adminEmail = 'admin@hiveloja.com.br';
const exists = db.prepare('SELECT 1 FROM users WHERE email=?').get(adminEmail);
if (!exists) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES (?,?,?,?)')
    .run('Robson', adminEmail, hash, 'admin');
}

// Helpers de dados
export function createCustomer({ name, email, phone }) {
  const stmt = db.prepare(`INSERT INTO customers (name,email,phone) VALUES (?,?,?)`);
  const info = stmt.run(name, email ?? null, phone ?? null);
  return { id: info.lastInsertRowid, name, email, phone };
}

export function listCustomers() {
  return db.prepare(`SELECT * FROM customers ORDER BY id DESC`).all();
}

export function createContract({ customer_id, total, parcelas, first_due }) {
  const insC = db.prepare(`
    INSERT INTO contracts (customer_id,total,parcelas,first_due) VALUES (?,?,?,?)
  `);
  const info = insC.run(customer_id, total, parcelas, first_due);
  const contract_id = info.lastInsertRowid;

  // gera parcelas (divide com ajuste na última)
  const base = Math.floor((total / parcelas) * 100) / 100;
  const last = +(total - base * (parcelas - 1)).toFixed(2);

  const insI = db.prepare(`
    INSERT INTO installments (contract_id,num,due_date,value,status)
    VALUES (?,?,?,?, 'open')
  `);

  let d = new Date(first_due); // yyyy-mm-dd
  for (let i = 1; i <= parcelas; i++) {
    const v = i === parcelas ? last : base;
    insI.run(contract_id, i, d.toISOString().slice(0,10), v);
    d.setMonth(d.getMonth() + 1); // próximo mês
  }

  return { contract_id };
}

export function listParcelasByCustomer(customer_id) {
  return db.prepare(`
    SELECT i.*
    FROM installments i
    JOIN contracts c ON c.id = i.contract_id
    WHERE c.customer_id = ?
    ORDER BY i.due_date, i.num
  `).all(customer_id);
}

export function payParcela(id) {
  db.prepare(`UPDATE installments SET status='paid', paid_at=datetime('now') WHERE id=?`).run(id);
  return { ok: true };
}

// server/index.js
import { db } from './db.js'; // <-- use chaves, import nomeado
