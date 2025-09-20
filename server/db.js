// server/db.js
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// garante que a pasta server/data exista (Render não cria pasta vazia)
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'data.sqlite');
const db = new Database(dbPath);

// ---------- criação de tabelas (idempotente) ----------
db.exec(`
CREATE TABLE IF NOT EXISTS customers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  email       TEXT,
  phone       TEXT,
  cpf         TEXT NOT NULL UNIQUE,   -- guardar só dígitos
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contracts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  total       REAL NOT NULL,
  tipo        TEXT NOT NULL DEFAULT 'negocio', -- negocio | venda | servico
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS installments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  value       REAL NOT NULL,
  due         TEXT NOT NULL,      -- 'YYYY-MM-DD'
  status      TEXT NOT NULL DEFAULT 'pendente', -- pendente | pago
  paid_at     TEXT                 -- datetime ISO
);

CREATE TABLE IF NOT EXISTS orders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id   INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product       TEXT NOT NULL,
  amount        REAL NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pendente', -- pendente | aprovado | recusado
  decision_note TEXT,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT,
  decided_at    TEXT
);

-- opcional: tabela de usuários admin (usamos fallback do .env se vazia)
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'admin'
);
`);

// ---------- MIGRATION segura: adiciona colunas de endereço se faltarem ----------
function ensureCustomerAddressColumns() {
  const cols = new Set(
    db.prepare(`PRAGMA table_info(customers)`).all().map(r => r.name)
  );
  const maybeAdd = (col) => {
    if (!cols.has(col)) db.exec(`ALTER TABLE customers ADD COLUMN ${col} TEXT`);
  };
  ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf']
    .forEach(maybeAdd);
}
ensureCustomerAddressColumns();

// ---------- helpers ----------
const onlyDigits = (s) => String(s || '').replace(/\D/g, '');
function normalizeCpf(cpf) {
  const d = onlyDigits(cpf).padStart(11, '0').slice(0, 11);
  return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
}
const toISODate = (d) => new Date(d).toISOString().slice(0, 10); // YYYY-MM-DD

// ---------- admin por .env (fallback) ----------
const ENV_ADMIN = {
  name: process.env.ADMIN_NAME || 'Admin',
  email: process.env.ADMIN_EMAIL || 'admin@example.com',
  password_hash: bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10),
  role: 'admin',
};

// ---------- clientes ----------
function createCustomer({
  name,
  email = null,
  phone = null,
  cpf,
  // endereço (opcionais)
  cep = null,
  logradouro = null,
  numero = null,
  complemento = null,
  bairro = null,
  cidade = null,
  uf = null,
}) {
  const cpfDigits = onlyDigits(cpf);

  const stmt = db.prepare(`
    INSERT INTO customers (
      name, email, phone, cpf,
      cep, logradouro, numero, complemento, bairro, cidade, uf
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  return stmt.run(
    name, email, phone, cpfDigits,
    cep, logradouro, numero, complemento, bairro, cidade, uf
  );
}

function findCustomerByCPF(cpf) {
  const cpfDigits = onlyDigits(cpf);
  const row = db.prepare(`SELECT * FROM customers WHERE cpf = ?`).get(cpfDigits);
  return row || null;
}

// NOVOS: listagem / leitura / atualização / exclusão
function listCustomers({ search = '', limit = 100, offset = 0 } = {}) {
  limit = Math.max(1, Math.min(Number(limit) || 100, 500));
  offset = Math.max(0, Number(offset) || 0);

  if (search) {
    const q = `%${String(search).toLowerCase()}%`;
    return db.prepare(`
      SELECT * FROM customers
      WHERE lower(name) LIKE ? OR lower(email) LIKE ? OR cpf LIKE ?
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `).all(q, q, search.replace(/\D/g, ''), limit, offset);
  }
  return db.prepare(`
    SELECT * FROM customers
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);
}

function getCustomerById(id) {
  return db.prepare(`SELECT * FROM customers WHERE id = ?`).get(Number(id)) || null;
}

function updateCustomer(id, fields = {}) {
  const allowed = ['name','email','phone','cep','logradouro','numero','complemento','bairro','cidade','uf'];
  const sets = [], args = [];
  for (const k of allowed) {
    if (fields[k] !== undefined) {
      sets.push(`${k} = ?`);
      args.push(fields[k] === '' ? null : String(fields[k]));
    }
  }
  if (!sets.length) return { changes: 0 };
  args.push(Number(id));
  const sql = `UPDATE customers SET ${sets.join(', ')} WHERE id = ?`;
  return db.prepare(sql).run(...args);
}

function deleteCustomer(id) {
  return db.prepare(`DELETE FROM customers WHERE id = ?`).run(Number(id));
}

// ---------- portal do cliente ----------
function getPortalDataByCustomerId(customerId) {
  const customer = db.prepare(`SELECT id, name, cpf FROM customers WHERE id = ?`).get(customerId);
  if (!customer) return null;

  const contracts = db.prepare(`
    SELECT id, customer_id, total, tipo, created_at
    FROM contracts
    WHERE customer_id = ?
    ORDER BY datetime(created_at) DESC
  `).all(customerId);

  const installments = db.prepare(`
    SELECT i.id, i.contract_id, i.value, i.due, i.status, i.paid_at
    FROM installments i
    JOIN contracts c ON c.id = i.contract_id
    WHERE c.customer_id = ?
    ORDER BY date(i.due) ASC, i.id ASC
  `).all(customerId)
   .map(i => ({
      id: i.id,
      contract_id: i.contract_id,
      value: i.value,  valor: i.value,
      due: i.due,      venc: i.due,
      status: i.status,
      paid_at: i.paid_at
    }));

  return { customer, contracts, installments };
}

// ---------- auth admin ----------
function findUserByEmail(email) {
  const row = db.prepare(`SELECT * FROM users WHERE lower(email) = lower(?)`).get(String(email || '').trim());
  if (row) return row;

  // fallback para usuário do .env (não grava em disco)
  if (String(email || '').trim().toLowerCase() === String(ENV_ADMIN.email).toLowerCase()) {
    return { id: 0, name: ENV_ADMIN.name, email: ENV_ADMIN.email, password_hash: ENV_ADMIN.password_hash, role: 'admin' };
  }
  return null;
}

// ---------- contratos & parcelas ----------
function createContractAndInstallments({ customer_id, total, parcelas, first_due, tipo = 'negocio' }) {
  const insertContract = db.prepare(`
    INSERT INTO contracts (customer_id, total, tipo) VALUES (?, ?, ?)
  `);
  const insertInst = db.prepare(`
    INSERT INTO installments (contract_id, value, due) VALUES (?, ?, ?)
  `);

  const tx = db.transaction(() => {
    const { lastInsertRowid: contract_id } = insertContract.run(customer_id, Number(total), String(tipo));

    // distribuição simples das parcelas (última recebe o ajuste de centavos)
    const n = Number(parcelas);
    const each = Math.floor((Number(total) / n) * 100) / 100;
    const last = Math.round((Number(total) - each * (n - 1)) * 100) / 100;

    const start = new Date(`${first_due}T00:00:00`);
    for (let i = 0; i < n; i++) {
      const dt = new Date(start);
      dt.setMonth(dt.getMonth() + i);
      const due = toISODate(dt);
      const value = (i === n - 1) ? last : each;
      insertInst.run(contract_id, value, due);
    }
    return contract_id;
  });

  return tx();
}

function listRecentContracts(limit = 25) {
  return db.prepare(`
    SELECT c.id, c.customer_id, c.total, c.tipo, c.created_at,
           u.name AS customer_name
    FROM contracts c
    JOIN customers u ON u.id = c.customer_id
    ORDER BY datetime(c.created_at) DESC
    LIMIT ?
  `).all(Number(limit));
}

function markInstallmentPaid(id) {
  const now = new Date().toISOString();
  return db.prepare(`
    UPDATE installments SET status = 'pago', paid_at = ?
    WHERE id = ?
  `).run(now, id);
}

function updateInstallment({ id, value, due, status }) {
  const sets = [];
  const args = [];
  if (value !== undefined) { sets.push('value = ?'); args.push(Number(value)); }
  if (due   !== undefined) { sets.push('due = ?');   args.push(String(due)); }
  if (status!== undefined) { sets.push('status = ?');args.push(String(status)); }
  if (!sets.length) return { changes: 0 };
  args.push(Number(id));
  const sql = `UPDATE installments SET ${sets.join(', ')} WHERE id = ?`;
  return db.prepare(sql).run(...args);
}

function deleteInstallment(id) {
  return db.prepare(`DELETE FROM installments WHERE id = ?`).run(Number(id));
}

function deleteContract(id) {
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM installments WHERE contract_id = ?`).run(Number(id));
    db.prepare(`DELETE FROM contracts WHERE id = ?`).run(Number(id));
  });
  tx();
  return { ok: true };
}

// ---------- pedidos (aprovar compras) ----------
function createOrderRequest({ customer_id, product, amount }) {
  return db.prepare(`
    INSERT INTO orders (customer_id, product, amount)
    VALUES (?, ?, ?)
  `).run(customer_id, product, Number(amount));
}

function listOrderRequests(status = 'pendente') {
  return db.prepare(`
    SELECT o.*, c.name AS customer_name, c.cpf
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    WHERE o.status = ?
    ORDER BY datetime(o.created_at) DESC
  `).all(String(status));
}

function listOrderRequestsByCustomer(customer_id) {
  return db.prepare(`
    SELECT * FROM orders
    WHERE customer_id = ?
    ORDER BY datetime(created_at) DESC
  `).all(Number(customer_id));
}

function setOrderRequestStatus(id, status, note = null) {
  const now = new Date().toISOString();
  const decided = (status === 'aprovado' || status === 'recusado') ? now : null;
  return db.prepare(`
    UPDATE orders
    SET status = ?, decision_note = ?, updated_at = ?, decided_at = ?
    WHERE id = ?
  `).run(String(status), note, now, decided, Number(id));
}

function deleteOrderRequest(id) {
  return db.prepare(`DELETE FROM orders WHERE id = ?`).run(Number(id));
}

// ---------- KPIs ----------
function monthEdges(year, month) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  const s = start.toISOString().slice(0, 10);
  const e = end.toISOString().slice(0, 10);
  return { s, e };
}

function sumReceivedForMonth(year, month) {
  const { s, e } = monthEdges(Number(year), Number(month));
  const row = db.prepare(`
    SELECT COALESCE(SUM(value), 0) AS total
    FROM installments
    WHERE status = 'pago'
      AND date(paid_at) >= date(?)
      AND date(paid_at) <  date(?)
  `).get(s, e);
  return Number(row?.total || 0);
}

function sumReceivedByMonth(year, month) {
  const { s, e } = monthEdges(Number(year), Number(month));
  const row = db.prepare(`
    SELECT COALESCE(SUM(value), 0) AS total,
           COUNT(*) AS count
    FROM installments
    WHERE status = 'pago'
      AND date(paid_at) >= date(?)
      AND date(paid_at) <  date(?)
  `).get(s, e);
  return { total: Number(row?.total || 0), count: Number(row?.count || 0) };
}

// ---------- PIX helper ----------
function getInstallmentWithCustomer(installmentId) {
  return db.prepare(`
    SELECT i.id, i.value, i.status, i.due, i.paid_at,
           c.id AS contract_id, c.customer_id,
           u.name AS customer_name, u.email, u.cpf
    FROM installments i
    JOIN contracts c ON c.id = i.contract_id
    JOIN customers u ON u.id = c.customer_id
    WHERE i.id = ?
  `).get(Number(installmentId));
}

// ---------- exports ----------
export {
  // helpers
  normalizeCpf,

  // clientes/portal
  createCustomer,
  findCustomerByCPF,
  getPortalDataByCustomerId,

  // NOVOS para página de edição/lista
  listCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,

  // auth admin
  findUserByEmail,

  // contratos/parcelas
  createContractAndInstallments,
  listRecentContracts,
  markInstallmentPaid,
  updateInstallment,
  deleteInstallment,
  deleteContract,

  // pedidos
  createOrderRequest,
  listOrderRequests,
  listOrderRequestsByCustomer,
  setOrderRequestStatus,
  deleteOrderRequest,

  // KPIs
  sumReceivedForMonth,
  sumReceivedByMonth,

  // PIX
  getInstallmentWithCustomer,
};
