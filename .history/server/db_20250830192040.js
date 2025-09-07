// server/db.js
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

export const normalizeCpf = (cpf) => (cpf || '').replace(/\D/g, '');

// --------- helpers (contratos) ----------
function splitInInstallments(total, n) {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / n);
  const resto = cents - base * n;
  const valores = Array.from({ length: n }, (_, i) => (i < resto ? base + 1 : base));
  return valores.map(v => v / 100);
}
function addMonthsISO(isoDate, add) {
  const d = new Date(isoDate + 'T00:00:00');
  d.setMonth(d.getMonth() + add);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// --------- DB init ----------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '../data.sqlite');
export const db = new Database(DB_PATH, { verbose: null });
console.log('DB file:', DB_PATH);

db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// --------- Tabelas ----------
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
  cpf TEXT,
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

-- Pedidos do cliente (para "Aprovar compras")
CREATE TABLE IF NOT EXISTS order_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product TEXT NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',   -- pendente | aprovado | recusado
  created_at TEXT DEFAULT (datetime('now')),
  decided_at TEXT,
  decision_note TEXT
);
`);

/* Migração leve: alguns bancos antigos podem não ter as novas colunas
   decided_at/decision_note. Garante criação sem quebrar nada. */
(function ensureOrderRequestDecisionCols(){
  const cols = db.prepare(`PRAGMA table_info(order_requests)`).all();
  if (!cols.some(c => c.name === 'decided_at')) {
    db.exec(`ALTER TABLE order_requests ADD COLUMN decided_at TEXT`);
  }
  if (!cols.some(c => c.name === 'decision_note')) {
    db.exec(`ALTER TABLE order_requests ADD COLUMN decision_note TEXT`);
  }
})();

// índice único opcional para CPF não vazio
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_cpf
  ON customers(cpf)
  WHERE cpf IS NOT NULL AND cpf <> '';
`);

// Garante colunas decided_at e decision_note se faltarem (migração leve)
(function ensureOrderRequestColumns(){
  const cols = db.prepare(`PRAGMA table_info(order_requests)`).all();
  const names = new Set(cols.map(c => c.name));

  if (!names.has('decided_at')) {
    db.exec(`ALTER TABLE order_requests ADD COLUMN decided_at TEXT`);
  }
  if (!names.has('decision_note')) {
    db.exec(`ALTER TABLE order_requests ADD COLUMN decision_note TEXT`);
  }
})();


// --------- Seed admin ----------
(function ensureAdminUser(){
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
})();

// --------- Domínio: usuários/clientes ----------
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

// --------- Domínio: contratos/parcelas ----------
export function createContractAndInstallments({ customer_id, total, parcelas, first_due }) {
  const info = db.prepare(`
    INSERT INTO contracts (customer_id, total, parcelas, first_due)
    VALUES (?, ?, ?, ?)
  `).run(customer_id, total, parcelas, first_due);

  const contract_id = info.lastInsertRowid;
  const valores = splitInInstallments(total, parcelas);

  const ins = db.prepare(`
    INSERT INTO installments (contract_id, value, due, status)
    VALUES (?, ?, ?, 'pendente')
  `);
  const tx = db.transaction(() => {
    for (let i = 0; i < parcelas; i++) {
      const due = addMonthsISO(first_due, i);
      ins.run(contract_id, valores[i], due);
    }
  });
  tx();

  return contract_id;
}
export function listRecentContracts(limit = 25) {
  return db.prepare(`
    SELECT c.id, c.customer_id, c.total, c.parcelas, c.first_due, c.created_at,
           cu.name AS customer_name, cu.cpf
    FROM contracts c
    JOIN customers cu ON cu.id = c.customer_id
    ORDER BY c.id DESC
    LIMIT ?
  `).all(limit);
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
export function markInstallmentPaid(id) {
  const today = new Date().toISOString().slice(0, 10);
  return db.prepare(`
    UPDATE installments
       SET status = 'pago',
           paid_at = ?
     WHERE id = ?
  `).run(today, id);
}
export function updateInstallment({ id, value, due, status }) {
  const cur = db.prepare(`SELECT * FROM installments WHERE id = ?`).get(id);
  if (!cur) throw new Error('Parcela não encontrada');

  const nv = (value  ?? cur.value);
  const nd = (due    ?? cur.due);
  const ns = (status ?? cur.status);

  return db.prepare(`
    UPDATE installments
       SET value = ?, due = ?, status = ?
     WHERE id = ?
  `).run(nv, nd, ns, id);
}
export function deleteInstallment(id) {
  return db.prepare(`DELETE FROM installments WHERE id = ?`).run(id);
}
export function deleteContract(contractId) {
  return db.prepare(`DELETE FROM contracts WHERE id = ?`).run(contractId);
}

// --------- Pedidos (order_requests) ----------
export function createOrderRequest({ customer_id, product, amount }) {
  return db.prepare(`
    INSERT INTO order_requests (customer_id, product, amount)
    VALUES (?, ?, ?)
  `).run(customer_id, String(product).trim(), Number(amount));
}

/* Lista pedidos.
   - status=null/undefined => lista todos
   - status='pendente'|'aprovado'|'recusado' => filtra por status (case-insensitive) */
export function listOrderRequests(status = null) {
  let sql = `
    SELECT o.*, c.name AS customer_name, c.cpf
    FROM order_requests o
    JOIN customers c ON c.id = o.customer_id
  `;
  const hasFilter = !!status;
  if (hasFilter) sql += ` WHERE lower(o.status) = lower(?) `;
  sql += ` ORDER BY o.id DESC`;
  return hasFilter ? db.prepare(sql).all(status) : db.prepare(sql).all();
}

export function listOrderRequestsByCustomer(customer_id) {
  return db.prepare(`
    SELECT id, product, amount, status, created_at, decided_at, decision_note
    FROM order_requests
    WHERE customer_id = ?
    ORDER BY id DESC
  `).all(customer_id);
}

// Atualiza status (normaliza para minúsculas)
export function setOrderRequestStatus(id, status, note = null) {
  const st = String(status).toLowerCase(); // 'aprovado' | 'recusado'
  return db.prepare(`
    UPDATE order_requests
       SET status = ?, decided_at = datetime('now'), decision_note = ?
     WHERE id = ?
  `).run(st, note, Number(id));
}


export function deleteOrderRequest(id) {
  return db.prepare(`DELETE FROM order_requests WHERE id = ?`).run(Number(id));
}

// --------- KPIs (recebidos) ----------
function monthRange(year, month) {
  const y = String(year);
  const m = String(month).padStart(2, '0');
  const start = `${y}-${m}-01`;
  const end = db.prepare(`SELECT DATE(?, '+1 month') AS d`).get(start).d;
  return { start, end };
}
export function sumReceivedByMonth(year, month) {
  const { start, end } = monthRange(year, month);
  const row = db.prepare(`
    SELECT COALESCE(SUM(value), 0) AS total,
           COUNT(*)                 AS count
    FROM installments
    WHERE LOWER(status) = 'pago'
      AND paid_at >= ?
      AND paid_at <  ?
  `).get(start, end);
  return row; // { total, count }
}
export function sumReceivedForMonth(year, month) {
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  const row = db.prepare(`
    SELECT COALESCE(SUM(value), 0) AS total
    FROM installments
    WHERE LOWER(status) = 'pago'
      AND paid_at IS NOT NULL
      AND strftime('%Y-%m', paid_at) = ?
  `).get(ym);
  return row.total || 0;
}
