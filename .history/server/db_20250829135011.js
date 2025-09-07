// server/db.js
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
// depois dos imports
export const normalizeCpf = (cpf) => (cpf || '').replace(/\D/g, '');


export const db = new Database('data.sqlite', { verbose: null });
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL'); // melhor estabilidade

// ============ TABELAS ============
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

// ============ CPF: coluna + índice (parcial) ============
function ensureCPFColumnAndIndex() {
  const cols = db.prepare(`PRAGMA table_info(customers)`).all();
  const hasCPF = cols.some(c => c.name === 'cpf');
  if (!hasCPF) {
    db.exec(`ALTER TABLE customers ADD COLUMN cpf TEXT`);
    console.log('✔️ Coluna cpf criada em customers');
  }

  // Índice ÚNICO apenas quando CPF tem valor (evita quebrar linhas vazias)
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_cpf
    ON customers(cpf)
    WHERE cpf IS NOT NULL AND cpf <> '';
  `);
}
ensureCPFColumnAndIndex();

// ============ Seed admin ============
function ensureAdminUser() {
  const exists = db.prepare('SELECT 1 FROM users LIMIT 1').get();
  if (!exists) {
    const email = 'admin@hiveloja.com.br';
    const hash = bcrypt.hashSync('123456', 10);
    db.prepare(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES (?, ?, ?, 'admin')
    `).run('Admin', email.toLowerCase(), hash);
    console.log('✔️ Seed admin => admin@hiveloja.com.br / 123456');
  }
}
ensureAdminUser();

// ============ Funções auxiliares ============
export function findUserByEmail(email) {
  return db.prepare(`
    SELECT id, name, email, password_hash, role
    FROM users
    WHERE lower(email) = lower(?)
  `).get(email);
}

export function findCustomerByCPF(cpf) {
  const ncpf = normalizeCpf(cpf);
  return db.prepare(`SELECT * FROM customers WHERE cpf = ?`).get(ncpf);
}


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

export function createCustomer({ name, email, phone, cpf }) {
  const ncpf = normalizeCpf(cpf);
  return db.prepare(`
    INSERT INTO customers (name, email, phone, cpf)
    VALUES (?, ?, ?, ?)
  `).run(name, email ?? null, phone ?? null, ncpf || null);
}


export function listCustomers() {
  return db.prepare(`
    SELECT id, name, email, phone, cpf, created_at
    FROM customers
    ORDER BY id DESC
  `).all();
}
