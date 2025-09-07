// server/index.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

import {
  findCustomerByCPF,
  getPortalDataByCustomerId,
  findUserByEmail,
  createCustomer,
  normalizeCpf,
  createContractAndInstallments,
  listRecentContracts,
  markInstallmentPaid
} from './db.js';


import {
  createContractAndInstallments,
  listRecentContracts,
  markInstallmentPaid,
  // ADICIONE:
  deleteContract,
  updateInstallment,
  deleteInstallment
} from './db.js';


const app = express();

// CORS – libera o front no 127 e no localhost:5500 (Live Server)
app.use(
  cors({
    origin: ['http://127.0.0.1:5500', 'http://localhost:5500'],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);
app.options('*', cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

/* ===========================
   Middleware: Auth do CLIENTE
   =========================== */
function authClient(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Sem token' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'client') {
      return res.status(403).json({ error: 'Permissão negada' });
    }
    req.client = payload; // { role:'client', customerId: N }
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido/expirado' });
  }
}

/* ===========================
   LOGIN ADMIN (compat + novo)
   =========================== */
function adminLoginHandler(req, res) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res
        .status(400)
        .json({ error: 'E-mail e senha são obrigatórios' });
    }

    const user = findUserByEmail(String(email).trim());
    if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });

    const ok = bcrypt.compareSync(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciais inválidas' });

    const token = jwt.sign(
      { role: 'admin', userId: user.id },
      JWT_SECRET,
      { expiresIn: '12h' },
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal' });
  }
}

// rotas admin (mantidas para compatibilidade)
app.post('/api/auth/login', adminLoginHandler);
app.post('/api/login', adminLoginHandler);

/* ===========================
   LOGIN do CLIENTE por CPF (ÚNICA ROTA)
   Retorna token de cliente
   =========================== */
app.post('/api/client/login', (req, res) => {
  try {
    const { cpf } = req.body || {};
    if (!cpf) return res.status(400).json({ error: 'CPF é obrigatório' });

    const clean = String(cpf).replace(/\D/g, '');
    const cli = findCustomerByCPF(clean);
    if (!cli) return res.status(404).json({ error: 'Cliente não encontrado' });

    const token = jwt.sign(
      { role: 'client', customerId: cli.id },
      JWT_SECRET,
      { expiresIn: '12h' },
    );

    res.json({ token, customer: { id: cli.id, name: cli.name, cpf: cli.cpf } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal' });
  }
});

/* ===========================
   PORTAL DO CLIENTE (com token)
   =========================== */
app.get('/api/client/portal', authClient, (req, res) => {
  try {
    const data = getPortalDataByCustomerId(req.client.customerId);
    if (!data) return res.status(404).json({ error: 'Portal não encontrado' });
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal' });
  }
});

/* ===========================
   PORTAL (ADMIN) por customerId
   =========================== */
app.get('/api/admin/portal/:customerId', (req, res) => {
  try {
    const id = Number(req.params.customerId);
    if (!id) return res.status(400).json({ error: 'customerId inválido' });

    const data = getPortalDataByCustomerId(id);
    if (!data) return res.status(404).json({ error: 'Portal não encontrado' });
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal' });
  }
});

/* ===========================
   CRUD mínimo de clientes
   =========================== */
app.post('/api/customers', (req, res) => {
  const { name, email, phone, cpf } = req.body || {};
  if (!name || !cpf) {
    return res
      .status(400)
      .json({ error: 'Nome e CPF são obrigatórios' });
  }

  try {
    const info = createCustomer({ name, email, phone, cpf }); // normaliza no db.js
    return res.status(201).json({
      id: info.lastInsertRowid,
      cpf: normalizeCpf(cpf), // só números (útil pro link do portal)
    });
  } catch (e) {
    if (String(e).includes('UNIQUE')) {
      return res.status(409).json({ error: 'CPF já cadastrado' });
    }
    console.error(e);
    return res.status(500).json({ error: 'Erro ao salvar cliente' });
  }
});

// Buscar cliente por CPF (útil para validar duplicidade)
app.get('/api/customers/by-cpf/:cpf', (req, res) => {
  const cpf = (req.params.cpf || '').replace(/\D/g, '');
  const cli = findCustomerByCPF(cpf);
  if (!cli) return res.status(404).json({ error: 'Cliente não encontrado' });
  res.json(cli);
});

/* ===========================
   Contratos e parcelas
   =========================== */
app.post('/api/contracts', (req, res) => {
  try {
    const {
      customer_id,
      cpf,
      base,
      margin = 0,
      parcelas,
      first_due,
      tipo = 'negocio',
    } = req.body || {};
    if ((!customer_id && !cpf) || !base || !parcelas || !first_due) {
      return res
        .status(400)
        .json({ error: 'Campos obrigatórios: (customer_id ou cpf), base, parcelas, first_due' });
    }

    const total = Number(base) * (1 + Number(margin || 0) / 100);

    let cid = Number(customer_id) || null;
    if (!cid) {
      const cli = findCustomerByCPF(cpf);
      if (!cli) return res.status(404).json({ error: 'Cliente (cpf) não encontrado' });
      cid = cli.id;
    }

    const contract_id = createContractAndInstallments({
      customer_id: cid,
      total,
      parcelas: Number(parcelas),
      first_due, // "YYYY-MM-DD"
      tipo,
    });

    res.status(201).json({ contract_id, total });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal' });
  }
});

app.get('/api/contracts/recent', (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 25, 100);
    res.json(listRecentContracts(limit));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal' });
  }
});

app.post('/api/installments/:id/pay', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'id inválido' });
    markInstallmentPaid(id);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal' });
  }
});

// EXCLUIR CONTRATO (cascata apaga parcelas)
app.delete('/api/contracts/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'id inválido' });
    deleteContract(id);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal' });
  }
});

// EDITAR PARCELA (valor, vencimento, status)
app.patch('/api/installments/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'id inválido' });

    const { value, due, status } = req.body || {};
    const info = updateInstallment({ id, value, due, status });
    res.json({ ok: true, changes: info.changes });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal' });
  }
});

// EXCLUIR PARCELA
app.delete('/api/installments/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'id inválido' });
    const info = deleteInstallment(id);
    res.json({ ok: true, changes: info.changes });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal' });
  }
});

// DELETE contrato + parcelas
app.delete('/api/contracts/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'id inválido' });

    // Como usamos SQLite com FK ON DELETE CASCADE,
    // basta apagar o contrato que as parcelas caem junto.
    const info = db.prepare('DELETE FROM contracts WHERE id = ?').run(id);
    if (info.changes === 0) return res.status(404).json({ error: 'Contrato não encontrado' });

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal' });
  }
});


/* ===========================
   Healthcheck
   =========================== */
app.get('/health', (_, res) => res.send('ok'));

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`API rodando em http://localhost:${port}`);
});
