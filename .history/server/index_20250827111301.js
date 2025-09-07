


// server/index.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';

import {
  createCustomer,
  listCustomers,
  createContract,
  listParcelasByCustomer,
  payParcela,
} from './db.js';

const express = require('express');
const cors = require('cors');


const app = express();
app.use(cors());
app.use(express.json());

// Healthcheck
app.get('/', (_req, res) => res.json({ ok: true }));

// Resumo do dashboard (mês corrente)
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


// Login com variáveis do .env
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

// Auth middleware
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

// --- Rotas de dados ---

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

// Parcelas (do cliente)
app.get('/api/customers/:id/installments', auth, (req, res) => {
  res.json({ parcelas: listParcelasByCustomer(Number(req.params.id)) });
});
// Alias em pt-BR para combinar com possíveis chamadas do front:
app.get('/api/customers/:id/parcelas', auth, (req, res) => {
  res.json({ parcelas: listParcelasByCustomer(Number(req.params.id)) });
});

// Pagar parcela
app.post('/api/installments/:id/pay', auth, (req, res) => {
  res.json(payParcela(Number(req.params.id)));
});
// Alias em pt-BR
app.post('/api/parcelas/:id/pay', auth, (req, res) => {
  res.json(payParcela(Number(req.params.id)));
});

const port = process.env.PORT || 4000;
app.listen(port, () =>
  console.log(`API rodando em http://localhost:${port}`)
);

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const { auth, requireAdmin, SECRET } = require('./auth');
const db = require('./db'); // seu módulo já existente (get/all)
