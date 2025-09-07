// server/index.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';

import {
  findCustomerByCPF,
  getPortalDataByCustomerId,
} from './db.js';

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

// ---------------------------------------------
// Middleware de autenticação do CLIENTE (token)
// ---------------------------------------------
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

// ---------------------------------------------
// ROTAS: LOGIN DO CLIENTE POR CPF
// ---------------------------------------------
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
      { expiresIn: '12h' }
    );

    res.json({
      token,
      customer: { id: cli.id, name: cli.name, cpf: cli.cpf }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal' });
  }
});

// ---------------------------------------------
// ROTAS: PORTAL DO CLIENTE (COM TOKEN DO CLIENTE)
// ---------------------------------------------
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

// ---------------------------------------------
// ROTAS: PORTAL (ADMIN/DASHBOARD) via ?customerId=123
// ---------------------------------------------
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

// ---------------------------------------------
// Healthcheck
// ---------------------------------------------
app.get('/health', (_, res) => res.send('ok'));

// ---------------------------------------------
// Start
// ---------------------------------------------
const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`API rodando em http://localhost:${port}`);
});
