// public/auth.js
(function () {
  // Lê do config.js; se faltar, infere pelo ambiente
  const CFG = window.APP_CONFIG || {};
  const API =
    CFG.API_URL ||
    (location.hostname.endsWith('.onrender.com') ? '' : 'http://127.0.0.1:4000');

  // Compatibilidade: tenta as duas rotas de login do backend
  const LOGIN_PATHS = ['/api/auth/login', '/api/login'];

  // Helpers de DOM
  const $ = (s) => document.querySelector(s);

  // Elementos do formulário (tente achar pelos ids comuns, com fallback)
  const form    = $('form') || document;
  const emailEl = $('#email') || $('input[type="email"]');
  const passEl  = $('#password') || $('input[type="password"]');
  const btn     = $('button[type="submit"]');

  // Área de mensagens (cria se não existir)
  let out = $('#out');
  if (!out) {
    out = document.createElement('p');
    out.id = 'out';
    out.className = 'muted';
    form.appendChild(out);
  }

  // Request JSON seguro (evita erro de parse quando o servidor devolve HTML)
  async function postJSON(url, body) {
    const res  = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const ct   = res.headers.get('content-type') || '';
    const text = await res.text();

    if (!ct.includes('application/json')) {
      // Ex.: 404 HTML, CORS, etc.
      throw new Error(`Servidor retornou ${res.status} ${res.statusText}. Verifique a URL da API.`);
    }

    const data = JSON.parse(text);
    if (!res.ok) throw new Error(data?.error || 'Falha no login');
    return data; // { token, user }
  }

  // Tenta logar em /api/auth/login e /api/login (compat)
  async function doLogin(email, password) {
    if (!API && API !== '') throw new Error('API_URL não configurado (config.js).');

    let lastErr = null;
    for (const path of LOGIN_PATHS) {
      try {
        const base = API === '' ? '' : API; // '' => mesma origem no Render
        return await postJSON(`${base}${path}`, { email: email.trim(), password });
      } catch (e) {
        lastErr = e; // tenta próxima
      }
    }
    throw lastErr || new Error('Não foi possível encontrar a rota de login da API.');
  }

  // Submit do formulário
  form.addEventListener('submit', async (ev) => {
    ev?.preventDefault();
    out.textContent = '';
    if (btn) btn.disabled = true;

    try {
      const email = (emailEl?.value || '').trim();
      const password = passEl?.value || '';

      if (!email || !password) throw new Error('Informe e-mail e senha.');

      const data = await doLogin(email, password);
      // Salva o token do ADMIN
      localStorage.setItem('admin_token', data.token);
      // Vai para o dashboard do admin
      location.href = 'dashboard.html';
    } catch (err) {
      out.textContent = err.message || 'Erro ao conectar';
      console.error('LOGIN ADMIN ERRO:', err);
    } finally {
      if (btn) btn.disabled = false;
    }
  });
})();
