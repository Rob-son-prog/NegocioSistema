// server/index.js (TOPO)
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';

import {
  db,                        // <-- agora via import nomeado
  createCustomer,
  listCustomers,
  createContract,
  listParcelasByCustomer,
  payParcela,
} from './db.js';

const app = express();

// CORS + JSON (pode deixar origin aberto durante dev)
app.use(cors({
  origin: ['http://127.0.0.1:5500', 'http://localhost:5500'],
}));
app.use(express.json());

// Healthcheck
app.get('/', (_req, res) => res.json({ ok: true }));

// =================== AUTH ===================
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token ausente' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

// Login com variáveis do .env (ADMIN)
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email e password são obrigatórios' });
  }

  const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || '').toLowerCase();
  const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '');
  const ADMIN_NAME = process.env.ADMIN_NAME || 'Admin';

  if (email.toLowerCase() !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  const user = { id: 1, name: ADMIN_NAME, email: ADMIN_EMAIL, role: 'admin' };
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );

  res.json({ token, user });
});

// Rota protegida para testar token
app.get('/api/me', auth, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      name: process.env.ADMIN_NAME || 'Admin',
    },
  });
});

// =================== RESUMO DO DASHBOARD ===================
app.get('/api/summary', auth, (req, res) => {
  try {
    // recebidos no mês (soma das parcelas pagas no mês)
    const recebidosMes = db.prepare(`
      SELECT COALESCE(SUM(value),0) AS total
      FROM installments
      WHERE status='paid'
        AND strftime('%Y-%m', paid_at) = strftime('%Y-%m','now')
    `).get().total;

    // negócios feitos (qtde de contratos criados no mês)
    const negociosFeitos = db.prepare(`
      SELECT COUNT(*) AS c
      FROM contracts
      WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m','now')
    `).get().c;

    // vendas no mês (soma do total de contratos do mês)
    const vendasMes = db.prepare(`
      SELECT COALESCE(SUM(total),0) AS total
      FROM contracts
      WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m','now')
    `).get().total;

    res.json({ recebidosMes, negociosFeitos, vendasMes });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao calcular resumo' });
  }
});

// =================== DADOS (CLIENTES / CONTRATOS / PARCELAS) ===================

// Clientes
app.get('/api/customers', auth, (_req, res) => {
  res.json({ customers: listCustomers() });
});

app.post('/api/customers', auth, (req, res) => {
  const { name, email, phone } = req.body;
  if (!name) return res.status(400).json({ error: 'name é obrigatório' });
  res.json({ customer: createCustomer({ name, email, phone }) });
});

// Contratos
app.post('/api/contracts', auth, (req, res) => {
  const { customer_id, total, parcelas, first_due } = req.body;
  if (!customer_id || !total || !parcelas || !first_due) {
    return res.status(400).json({
      error: 'Campos obrigatórios: customer_id, total, parcelas, first_due',
    });
  }
  res.json(createContract({ customer_id, total, parcelas, first_due }));
});

// Parcelas do cliente
app.get('/api/customers/:id/installments', auth, (req, res) => {
  res.json({ parcelas: listParcelasByCustomer(Number(req.params.id)) });
});
app.get('/api/customers/:id/parcelas', auth, (req, res) => {
  res.json({ parcelas: listParcelasByCustomer(Number(req.params.id)) });
});

// Pagar parcela
app.post('/api/installments/:id/pay', auth, (req, res) => {
  res.json(payParcela(Number(req.params.id)));
});
app.post('/api/parcelas/:id/pay', auth, (req, res) => {
  res.json(payParcela(Number(req.params.id)));
});

// === LOGIN DO CLIENTE POR CPF ============================================
app.post('/api/auth/client-login', (req, res) => {
  try {
    const cpf = String(req.body?.cpf || '').replace(/\D/g, '');
    if (cpf.length !== 11) return res.status(400).json({ error: 'cpf inválido' });

    // procura o cliente por CPF (aceita cpf salvo com pontuação)
    const cli = db.prepare(`
      SELECT id, name, cpf
      FROM customers
      WHERE REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), '/', '') = ?
         OR cpf = ?
    `).get(cpf, cpf);

    if (!cli) return res.status(404).json({ error: 'não encontrado' });

    const token = jwt.sign({ role: 'client', customerId: cli.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, client: { id: cli.id, name: cli.name } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal' });
  }
});

// === PORTAL DO CLIENTE (ele mesmo) =======================================
app.get('/api/portal/me', auth, (req, res) => {
  try {
    if (req.user.role !== 'client') return res.status(403).json({ error: 'forbidden' });
    const id = req.user.customerId;

    const cli = db.prepare(`SELECT id, name, cpf FROM customers WHERE id = ?`).get(id);
    if (!cli) return res.status(404).json({ error: 'não encontrado' });

    const parcelas = listParcelasByCustomer(id); // já existente no seu projeto
    const toNum = (v) => Number(v || 0);
    const total = parcelas.reduce((s, p) => s + toNum(p.valor ?? p.value), 0);
    const pagas = parcelas.filter(p => (p.status || '').toLowerCase() === 'pago' || (p.status || '').toLowerCase() === 'paid').length;

    res.json({
      id: cli.id,
      nome: cli.name,
      cpf: cli.cpf,
      total,
      pagas,
      parcelas
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal' });
  }
});


// =================== START ===================
const port = process.env.PORT || 4000;
app.listen(port, () =>
  console.log(`API rodando em http://localhost:${port}`)
);

