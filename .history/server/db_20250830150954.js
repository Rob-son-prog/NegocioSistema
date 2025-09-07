import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

export const normalizeCpf = (cpf) => (cpf || '').replace(/\D/g, '');

// Divide valor total em N parcelas (centavos corretos; a última ajusta arredondamento)
function splitInInstallments(total, n) {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / n);
  const resto = cents - base * n;
  const valores = Array.from({ length: n }, (_, i) => (i < resto ? base + 1 : base));
  return valores.map(v => v / 100);
}

// soma meses (YYYY-MM-DD)
function addMonthsISO(isoDate, add) {
  const d = new Date(isoDate + 'T00:00:00');
  d.setMonth(d.getMonth() + add);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// Cria contrato + gera parcelas
export function createContractAndInstallments({ customer_id, total, parcelas, first_due, tipo }) {
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

// Consulta contratos recentes (para o dashboard)
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

// Marca parcela como paga (MVP – substituímos por webhook PIX depois)
export function markInstallmentPaid(installmentId) {
  return db.prepare(`
    UPDATE installments
    SET status = 'pago', paid_at = datetime('now')
    WHERE id = ?
  `).run(installmentId);
}


// Garante que sempre use o mesmo arquivo dentro de /server/../data.sqlite
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '../data.sqlite');  // fora da pasta server
export const db = new Database(DB_PATH, { verbose: null });
console.log('DB file:', DB_PATH);

db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');


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

// --- excluir contrato (cai em cascata nas parcelas) ---
export function deleteContract(contractId) {
  return db.prepare(`DELETE FROM contracts WHERE id = ?`).run(contractId);
}

// --- atualizar parcela (value/due/status) ---
export function updateInstallment({ id, value, due, status }) {
  const cur = db.prepare(`SELECT * FROM installments WHERE id = ?`).get(id);
  if (!cur) throw new Error('Parcela não encontrada');

  const nv = (value ?? cur.value);
  const nd = (due   ?? cur.due);
  const ns = (status ?? cur.status);

  return db.prepare(`
    UPDATE installments
       SET value = ?, due = ?, status = ?
     WHERE id = ?
  `).run(nv, nd, ns, id);
}

// --- garante que 'pagar' grava paid_at ---
export function markInstallmentPaid(id) {
  const stmt = db.prepare(`
    UPDATE installments
       SET status = 'pago',
           paid_at = COALESCE(paid_at, DATE('now'))
     WHERE id = ?;
  `);
  return stmt.run(id);
}

// --- helper: intervalo do mês (UTC) ---
function monthRange(year, month) {
  const y = String(year);
  const m = String(month).padStart(2, '0');
  const start = `${y}-${m}-01`;
  // SQLite: próximo mês = start of month + 1 month
  const end = db.prepare(`SELECT DATE(?, '+1 month') AS d`).get(start).d;
  return { start, end };
}

// total recebido (parcelas com status=pago e paid_at dentro do mês)
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


// --- excluir parcela isolada ---
export function deleteInstallment(id) {
  return db.prepare(`DELETE FROM installments WHERE id = ?`).run(id);
}
