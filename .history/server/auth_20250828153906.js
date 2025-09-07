// server/auth.js
const jwt = require('jsonwebtoken');             // << aqui estava escrito errado
const SECRET = process.env.JWT_SECRET || 'dev-secret';

// middleware: valida Bearer <token>
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const [, token] = h.split(' ');
  if (!token) return res.status(401).json({ error: 'missing token' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid token' });
  }
}

// exige papel admin
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
}

module.exports = { auth, requireAdmin, SECRET }; // << garanta "exports"

// auth.js
(function () {
  const API = 'http://127.0.0.1:4000';
  const LOGIN_PATHS = ['/api/auth/login', '/api/login']; // nova e antiga (compat)

  const $ = (s) => document.querySelector(s);

  // tente achar campos por id; ajuste se seus ids forem diferentes
  const form = $('form') || document;
  const emailEl = $('#email') || $('input[type="email"]');
  const passEl  = $('#password') || $('input[type="password"]');
  const btn     = $('button[type="submit"]');

  // área de mensagens
  let out = $('#out');
  if (!out) {
    out = document.createElement('p');
    out.id = 'out';
    out.className = 'muted';
    form.appendChild(out);
  }

  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();

    // Se o servidor devolveu HTML (ex.: 404 do Live Server), evita o "Unexpected token '<'"
    if (!contentType.includes('application/json')) {
      throw new Error(`Servidor retornou ${res.status} ${res.statusText} (conteúdo HTML). Verifique a URL do endpoint.`);
    }

    const data = JSON.parse(text);
    if (!res.ok) throw new Error(data?.error || 'Falha no login');
    return data; // { token, user }
  }

  async function doLogin(email, password) {
    let lastErr = null;
    for (const p of LOGIN_PATHS) {
      try {
        return await postJSON(API + p, { email: email.trim(), password });
      } catch (e) {
        lastErr = e; // tenta próxima rota
      }
    }
    throw lastErr || new Error('Não foi possível encontrar a rota de login da API.');
  }

  form.addEventListener('submit', async (ev) => {
    if (ev) ev.preventDefault();
    out.textContent = '';
    if (btn) btn.disabled = true;

    try {
      const email = (emailEl?.value || '').trim();
      const password = passEl?.value || '';
      if (!email || !password) throw new Error('Informe e-mail e senha.');

      const data = await doLogin(email, password);
      localStorage.setItem('admin_token', data.token);
      location.href = 'dashboard.html';
    } catch (err) {
      out.textContent = err.message || 'Erro ao conectar';
      console.error('LOGIN ADMIN ERRO:', err);
    } finally {
      if (btn) btn.disabled = false;
    }
  });
})();
