// script.js (v10) — login admin usando a rota correta /api/auth/login
document.addEventListener('DOMContentLoaded', () => {
  if (window.__loginInit) return;
  window.__loginInit = true;

  const API = 'http://127.0.0.1:4000';
  console.log('[login] script.js carregado. Endpoint:', `${API}/api/auth/login`);

  const form = document.getElementById('login-form');
  const out  = document.getElementById('out');

  if (!form) {
    console.warn('Form #login-form não encontrado');
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    out.style.color = '#111827';
    out.textContent = 'Enviando...';

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    try {
      const res  = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const text = await res.text(); // evita "Unexpected token '<'"
      let data;
      try { data = JSON.parse(text); }
      catch { throw new Error(`Resposta não JSON (${res.status}): ${text.slice(0,120)}`); }

      if (!res.ok) throw new Error(data?.error || `Erro HTTP ${res.status}`);

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      out.style.color = '#065f46';
      out.textContent = 'Login ok!';
      setTimeout(() => (location.href = 'dashboard.html'), 500);
    } catch (err) {
      out.style.color = '#b91c1c';
      out.textContent = err.message || 'Erro inesperado';
      console.error('[login] erro:', err);
    }
  });
});
// script.js (v11) — login admin
document.addEventListener('DOMContentLoaded', () => {
  if (window.__loginInit) return;
  window.__loginInit = true;

  const API = 'http://127.0.0.1:4000';
  // Constrói a URL de forma robusta (evita barras faltando/sobrando)
  const LOGIN_URL = new URL('/api/auth/login', API).toString();
  console.log('[login] usando endpoint:', LOGIN_URL);

  const form = document.getElementById('login-form');
  const out  = document.getElementById('out');
  if (!form) { console.warn('Form #login-form não encontrado'); return; }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    out.style.color = '#111827';
    out.textContent = 'Enviando...';

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    try {
      const res  = await fetch(LOGIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      // Lê como texto primeiro (evita "Unexpected token '<' ... is not valid JSON")
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); }
      catch { throw new Error(`Resposta não JSON (${res.status}): ${text.slice(0,120)}`); }

      if (!res.ok) throw new Error(data?.error || `Erro HTTP ${res.status}`);

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      out.style.color = '#065f46';
      out.textContent = 'Login ok!';
      setTimeout(() => (location.href = 'dashboard.html'), 500);
    } catch (err) {
      out.style.color = '#b91c1c';
      out.textContent = err.message || 'Erro inesperado';
      console.error('[login] erro:', err);
    }
  });
});
