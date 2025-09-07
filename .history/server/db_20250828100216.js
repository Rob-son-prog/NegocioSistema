// server/db.js
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

export const db = new Database('data.sqlite');
db.pragma('foreign_keys = ON');

// =================== CRIAÇÃO DE TABELAS ===================
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
  first_due TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS installments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  value REAL NOT NULL,
  due TEXT NOT NULL,
  status TEXT DEFAULT 'pendente',
  paid_at TEXT
);
`);

// =================== GARANTIR COLUNA CPF ===================
try {
  db.exec(`ALTER TABLE customers ADD COLUMN cpf TEXT UNIQUE;`);
} catch (e) {
  if (!String(e).includes('duplicate column name')) {
    console.error("Erro ao adicionar coluna CPF:", e);
  }
}

// =================== FUNÇÕES AUXILIARES ===================

// Buscar cliente por CPF
export function findCustomerByCPF(cpf) {
  return db.prepare('SELECT * FROM customers WHERE cpf = ?').get(cpf);
}

// Buscar dados completos do portal por cliente
export function getPortalDataByCustomerId(customerId) {
  const customer = db.prepare(`
    SELECT id, name, email, phone, cpf
    FROM customers
    WHERE id = ?
  `).get(customerId);

  if (!customer) return null;

  const contracts = db.prepare(`
    SELECT id, total, parcelas, first_due, created_at
    FROM contracts
    WHERE customer_id = ?
    ORDER BY id DESC
  `).all(customerId);

  const installments = db.prepare(`
    SELECT i.id, i.contract_id, i.value, i.due, i.status, i.paid_at
    FROM installments i
    JOIN contracts c ON c.id = i.contract_id
    WHERE c.customer_id = ?
    ORDER BY i.due ASC
  `).all(customerId);

  return { customer, contracts, installments };
}

// Exemplo de criar cliente (já com CPF)
export function createCustomer({ name, email, phone, cpf }) {
  return db.prepare(`
    INSERT INTO customers (name, email, phone, cpf)
    VALUES (?, ?, ?, ?)
  `).run(name, email, phone, cpf);
}

// Exemplo de listar clientes
export function listCustomers() {
  return db.prepare(`SELECT id, name, email, phone, cpf, created_at FROM customers`).all();
}
