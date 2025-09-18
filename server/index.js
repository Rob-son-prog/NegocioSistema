// server/index.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// ===== DB (funções existentes) =====
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
  deleteContract,
  updateInstallment,
  deleteInstallment,

  // pedidos (aprovar compras)
  createOrderRequest,
  listOrderRequests,
  listOrderRequestsByCustomer,
  setOrderRequestStatus,
  deleteOrderRequest,

  // KPIs
  sumReceivedForMonth,
  sumReceivedByMonth,

  // usado no PIX
  getInstallmentWithCustomer,
} from './db.js';

// ===== Mercado Pago SDK v2 =====
import { MercadoPagoConfig, Payment } from 'mercadopago';

// --- INÍCIO: ajustes de segurança/sandbox ---
const MP_TOKEN = process.env.MP_ACCESS_TOKEN || '';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Log seguro só do prefixo (ajuda a depurar se é TEST- ou APP_USR-)
console.log('Mercado Pago token em uso (prefixo):', MP_TOKEN.slice(0, 7) || '(vazio)');

// Em ambiente não-produtivo, recusar APP_USR para evitar 401 "Unauthorized use of live credentials"
if (NODE_ENV !== 'production' && MP_TOKEN.startsWith('APP_USR-')) {
  console.warn(
    '[ATENÇÃO] Você está em', NODE_ENV,
    'mas o MP_ACCESS_TOKEN é APP_USR- (produção). Troque para TEST- no .env.'
  );
}
// --- FIM: ajustes de segurança/sandbox ---

const mpClient = new MercadoPagoConfig({
  accessToken: MP_TOKEN, // deve ser TEST-... em dev
});

const mpPayment = new Payment(mpClient);
const WEBHOOK_URL = process.env.WEBHOOK_URL || '';

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

// ============== Middleware: Auth do CLIENTE ==============
// (sem alterações)
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

// ============== LOGIN ADMIN (compat + novo) ==============
// (sem alterações)
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

// ============== LOGIN do CLIENTE por CPF ==============
// (sem alterações)
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

// ============== PORTAL DO CLIENTE ==============
// (sem alterações)
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

// Admin visualiza portal por customerId
// (sem alterações)
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

// ============== CLIENTES ==============
// (sem alterações)
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
app.get('/api/customers/by-cpf/:cpf', (req, res) => {
  const cpf = (req.params.cpf || '').replace(/\D/g, '');
  const cli = findCustomerByCPF(cpf);
  if (!cli) return res.status(404).json({ error: 'Cliente não encontrado' });
  res.json(cli);
});

// ============== CONTRATOS & PARCELAS ==============
// (sem alterações)
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

// ============== KPIs (dashboard) ==============
// (sem alterações)
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

// ============== PEDIDOS (Aprovar compras) ==============
// (sem alterações)
app.post('/api/orders', authClient, (req, res) => {
  try {
    const { product, amount } = req.body || {};
    if (!product || isNaN(Number(amount))) {
      return res.status(400).json({ error: 'Produto e valor são obrigatórios' });
    }
    const info = createOrderRequest({
      customer_id: req.client.customerId,
      product: String(product).trim(),
      amount: Number(amount)
    });
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal' });
  }
});
app.get('/api/orders', (req, res) => {
  try {
    const status = req.query.status || 'pendente'; // pendente | aprovado | recusado
    res.json(listOrderRequests(status));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal' });
  }
});
app.get('/api/orders/pending', (_req, res) => {
  try {
    res.json(listOrderRequests('pendente'));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal' });
  }
});
app.post('/api/orders/:id/approve', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'id inválido' });
    const note = req.body?.note ?? 'Seu pedido foi aprovado.';
    setOrderRequestStatus(id, 'aprovado', note);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'internal' }); }
});
app.post('/api/orders/:id/reject', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'id inválido' });
    const note = req.body?.note ?? 'Seu pedido foi recusado.';
    setOrderRequestStatus(id, 'recusado', note);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'internal' }); }
});
app.delete('/api/orders/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'id inválido' });
    deleteOrderRequest(id);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'internal' }); }
});
app.get('/api/client/orders', authClient, (req, res) => {
  try {
    res.json(listOrderRequestsByCustomer(req.client.customerId));
  } catch (e) { console.error(e); res.status(500).json({ error: 'internal' }); }
});


// ============== PIX (Mercado Pago) ==============
app.post('/api/installments/:id/pix', async (req, res) => {
  try {
    // 1) validação de credencial
    if (!MP_TOKEN) {
      return res.status(500).json({ error: 'MP_ACCESS_TOKEN não configurado (.env)' });
    }
    if (NODE_ENV !== 'production' && MP_TOKEN.startsWith('APP_USR-')) {
      return res.status(400).json({ error: 'Em desenvolvimento use um token TEST- do Mercado Pago (sandbox).' });
    }

    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'id inválido' });

    // 2) carrega parcela + cliente
    const it = getInstallmentWithCustomer(id);
    if (!it) return res.status(404).json({ error: 'Parcela não encontrada' });
    if (String(it.status || '').toLowerCase() === 'pago') {
      return res.status(409).json({ error: 'Parcela já paga' });
    }

    const transaction_amount = Number(it.value || it.valor || 0);
    if (!transaction_amount || isNaN(transaction_amount)) {
      return res.status(400).json({ error: 'Valor da parcela inválido' });
    }

    const description = `Parcela #${id} — ${it.customer_name || it.name || 'Cliente'}`;

    // Em DEV use sempre CPF de teste aceito pelo MP (evita rejeições bestas)
    const cpfDev = '19119119100';
    const cpfReal = String(it.cpf || '').replace(/\D/g,'').padEnd(11,'0').slice(0,11);

    const payer = {
      first_name: (it.customer_name || it.name || '').split(' ')[0] || 'Cliente',
      email: it.email || 'comprador_teste@example.com',
      identification: {
        type: 'CPF',
        number: NODE_ENV !== 'production' ? cpfDev : cpfReal
      }
    };

    const body = {
      transaction_amount,
      description,
      payment_method_id: 'pix',
      payer,
      metadata: { installment_id: id, customer_id: it.customer_id },
      notification_url: WEBHOOK_URL || undefined, // vazio em dev
    };

    const p = await mpPayment.create({ body });

    const trx = p?.point_of_interaction?.transaction_data || {};
    return res.status(201).json({
      payment_id: p?.id,
      status: p?.status,
      status_detail: p?.status_detail,
      qr_code: trx.qr_code,
      qr_base64: trx.qr_code_base64 ? `data:image/png;base64,${trx.qr_code_base64}` : null,
      ticket_url: trx.ticket_url || null,
    });

  } catch (e) {
    // Em dev, devolve detalhes para ver o motivo real (401, 400, etc)
    const details =
      e?.response?.data || e?.response || e?.message || e || 'unknown';
    console.error('PIX create error:', details);

    if (NODE_ENV !== 'production') {
      return res.status(500).json({ error: 'Falha ao gerar PIX', details });
    }
    return res.status(500).json({ error: 'Falha ao gerar PIX' });
  }
});

// >>> NOVO: endpoint de status (usado pelo front para polling)
app.get('/api/pix/:paymentId', async (req, res) => {
  try {
    const paymentId = req.params.paymentId;
    const p = await mpPayment.get({ id: paymentId }); // SDK v2
    return res.json({
      id: p?.id,
      status: p?.status,
      status_detail: p?.status_detail,
      metadata: p?.metadata || {},
    });
  } catch (e) {
    console.error('PIX status error:', e?.response || e);
    return res.status(500).json({ error: 'Falha ao consultar status' });
  }
});

// webhook (quando publicar!)
app.post('/api/pix/webhook', express.json({ type: '*/*' }), async (req, res) => {
  try {
    let paymentId = null;

    if (req.body?.data?.id) paymentId = req.body.data.id;
    if (!paymentId && req.query?.id && req.query?.topic === 'payment') paymentId = req.query.id;

    if (!paymentId) { res.status(200).send('ok'); return; }

    const p = await mpPayment.get({ id: paymentId }); // SDK v2

    if (p?.status === 'approved' && p?.metadata?.installment_id) {
      try {
        markInstallmentPaid(Number(p.metadata.installment_id));
      } catch (err) {
        console.error('Erro ao marcar parcela paga via webhook:', err);
      }
    }

    res.status(200).send('ok');
  } catch (e) {
    console.error('Webhook error:', e?.response || e);
    res.status(200).send('ok'); // responda 200 para o MP não re-tentar sem fim
  }
});

// ============== Healthcheck & listen ==============
app.get('/health', (_, res) => res.send('ok'));

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`API rodando em http://localhost:${port}`);
});
