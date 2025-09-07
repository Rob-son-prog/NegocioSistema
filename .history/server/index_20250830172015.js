// server/index.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

import {
  createOrderRequest,
  listOrderRequests,
  setOrderRequestStatus,
  deleteOrderRequest
} from './db.js';


import {
  // clientes / portal
  findCustomerByCPF,
  getPortalDataByCustomerId,
  findUserByEmail,
  createCustomer,
  normalizeCpf,

  // contratos / parcelas
  createContractAndInstallments,
  listRecentContracts,
  markInstallmentPaid,

  // admin - edição/exclusão
  deleteContract,
  updateInstallment,
  deleteInstallment,

  // KPIs
  sumReceivedForMonth,     // retorna total (number)
  sumReceivedByMonth       // retorna { total, count }
} from './db.js';

import {
  // ...outros imports
  createPurchaseRequest,
  listRecentPurchaseRequests
} from './db.js';


const app = express();

// CORS – libera o front no 127/localhost:5500 (Live Server)
app.use(cors({
  origin: ['http://127.0.0.1:5500', 'http://localhost:5500'],
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
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
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });
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

// rotas admin (compat)
app.post('/api/auth/login', adminLoginHandler);
app.post('/api/login',       adminLoginHandler);

/* ===========================
   LOGIN do CLIENTE por CPF
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
   PORTAL DO CLIENTE (token)
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
    return res.status(400).json({ error: 'Nome e CPF são obrigatórios' });
  }

  try {
    const info = createCustomer({ name, email, phone, cpf });
    return res.status(201).json({
      id: info.lastInsertRowid,
      cpf: normalizeCpf(cpf),
    });
  } catch (e) {
    if (String(e).includes('UNIQUE')) {
      return res.status(409).json({ error: 'CPF já cadastrado' });
    }
    console.error(e);
    return res.status(500).json({ error: 'Erro ao salvar cliente' });
  }
});

// Buscar cliente por CPF (evitar duplicidade)
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
      return res.status(400).json({
        error: 'Campos obrigatórios: (customer_id ou cpf), base, parcelas, first_due'
      });
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

// contratos recentes para o dashboard
app.get('/api/contracts/recent', (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 25, 100);
    res.json(listRecentContracts(limit));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal' });
  }
});

// marcar parcela como paga (MVP)
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

// editar parcela (valor, vencimento, status)
app.patch('/api/installments/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'id inválido' });

    const { value, due, status } = req.body || {};
    const info = updateInstallment({ id, value, due, status });
    res.json({ ok: true, changes: info?.changes ?? 0 });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal' });
  }
});

// excluir parcela
app.delete('/api/installments/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'id inválido' });
    const info = deleteInstallment(id);
    res.json({ ok: true, changes: info?.changes ?? 0 });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal' });
  }
});

// excluir contrato (cascata apaga parcelas)
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

/* ===========================
   KPI: Total recebido no mês
   =========================== */
// rota usada pelo dashboard.js
app.get('/api/kpis/recebidos-mes', (req, res) => {
  try {
    const now = new Date();
    const year  = Number(req.query.year)  || now.getFullYear();
    const month = Number(req.query.month) || (now.getMonth() + 1);
    const total = sumReceivedForMonth(year, month);
    res.json({ year, month, total });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal' });
  }
});

// opcional: outra rota, se quiser contagem também
app.get('/api/kpis/monthly', (req, res) => {
  try {
    const now = new Date();
    const y = Number(req.query.year  || now.getFullYear());
    const m = Number(req.query.month || (now.getMonth() + 1));
    const { total, count } = sumReceivedByMonth(y, m);
    res.json({ year: y, month: m, received_total: total, received_count: count });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal' });
  }
});

// Cliente cria pedido (precisa estar logado como CLIENTE)
app.post('/api/requests', authClient, (req, res) => {
  try{
    const { product, estimate } = req.body || {};
    if (!product || !String(product).trim()){
      return res.status(400).json({ error: 'Produto é obrigatório' });
    }
    const info = createPurchaseRequest({
      customer_id: req.client.customerId,
      product: String(product).trim(),
      estimate: estimate != null ? Number(estimate) : null
    });
    res.status(201).json({ ok:true, id: info.lastInsertRowid });
  }catch(e){
    console.error(e);
    res.status(500).json({ error: 'internal' });
  }
});

// (Opcional) Admin lista pedidos recentes
app.get('/api/admin/requests/recent', (req, res) => {
  try{
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    res.json(listRecentPurchaseRequests(limit));
  }catch(e){
    console.error(e);
    res.status(500).json({ error: 'internal' });
  }
});

/* ===========================
   PEDIDOS (novo pedido do cliente)
   =========================== */

// Cliente cria pedido (precisa estar logado como cliente)
app.post('/api/orders', authClient, (req, res) => {
  try {
    const { product, amount } = req.body || {};
    if (!product || !amount) {
      return res.status(400).json({ error: 'Produto e valor são obrigatórios' });
    }
    const id = createOrderRequest({
      customer_id: req.client.customerId,
      product: String(product).trim(),
      amount: Number(amount)
    });
    res.status(201).json({ id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal' });
  }
});

// Admin lista pedidos (pendentes por padrão)
// /api/orders?status=pendente|aprovado|recusado  (ou sem status para todos)
app.get('/api/orders', (req, res) => {
  try {
    const status = req.query.status ?? 'pendente';
    const list = listOrderRequests(status);
    res.json(list);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal' });
  }
});

// Admin aprova
app.post('/api/orders/:id/approve', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'id inválido' });
    setOrderRequestStatus(id, 'aprovado');
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal' });
  }
});

// Admin recusa
app.post('/api/orders/:id/reject', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'id inválido' });
    setOrderRequestStatus(id, 'recusado');
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal' });
  }
});

// (opcional) Admin remove um pedido
app.delete('/api/orders/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'id inválido' });
    deleteOrderRequest(id);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal' });
  }
});

// CLIENTE cria pedido (precisa estar logado como cliente)
app.post('/api/orders', authClient, (req, res) => {
  try {
    const { product, amount } = req.body || {};
    if (!product || !amount) return res.status(400).json({ error: 'Produto e valor são obrigatórios' });
    const info = createOrderRequest({ customer_id: req.client.customerId, product, amount: Number(amount) });
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal' });
  }
});

// ADMIN: lista para aprovação
app.get('/api/orders', (req, res) => {
  try {
    res.json(listOrderRequests(200));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal' });
  }
});

// ADMIN: aprovar/reprovar
app.post('/api/orders/:id/approve', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'id inválido' });
    const note = req.body?.note ?? 'Seu pedido foi aprovado.';
    setOrderRequestStatus(id, 'approved', note);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'internal' }); }
});
app.post('/api/orders/:id/reject', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'id inválido' });
    const note = req.body?.note ?? 'Seu pedido foi reprovado.';
    setOrderRequestStatus(id, 'rejected', note);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'internal' }); }
});

// CLIENTE: ver pedidos dele (usado p/avisos no portal)
app.get('/api/client/orders', authClient, (req, res) => {
  try {
    const rows = listOrderRequestsByCustomer(req.client.customerId);
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'internal' }); }
});




/* ===========================
   Healthcheck
   =========================== */
app.get('/health', (_, res) => res.send('ok'));

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`API rodando em http://localhost:${port}`);
});
