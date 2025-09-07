document.addEventListener('DOMContentLoaded', () => {
  // evita re-inicializar se o live server injetar script
  if (window.__loginInit) return;
  window.__loginInit = true;

  const API = 'http://localhost:4000';
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
      const r = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Falha no login');

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      out.style.color = '#065f46';
      out.textContent = 'Login ok!';
      setTimeout(() => (location.href = 'dashboard.html'), 500);
      

      // setTimeout(() => location.href = 'dashboard.html', 600);
    } catch (err) {
      out.style.color = '#b91c1c';
      out.textContent = err.message || 'Erro inesperado';
      console.error(err);
    }
  });
});

