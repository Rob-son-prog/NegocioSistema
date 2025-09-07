(() => {
  const API = (window.APP_CONFIG?.API_URL || 'http://127.0.0.1:4000').replace(/\/+$/,'');
  const TOKEN_KEY = 'client_token';

  // ----- valida token ao abrir a página -----
  async function ensureSession() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return redirectLogin();
    try {
      const r = await fetch(`${API}/api/client/portal`, { headers:{ Authorization: 'Bearer '+token } });
      if (r.status === 401) throw new Error('expired');
    } catch {
      return redirectLogin('expired');
    }
  }
  function redirectLogin(reason) {
    try { localStorage.removeItem(TOKEN_KEY); } catch {}
    const q = new URLSearchParams(location.search);
    const back = location.pathname + (q.toString()?`?${q}`:'');
    location.replace(`acesso-cliente.html?session=${reason||'invalid'}&redirect=${encodeURIComponent(back)}`);
  }

  // ----- helpers -----
  const form = document.getElementById('formPedido');
  const out  = document.getElementById('out');
  const iptProduto = document.getElementById('produto');
  const iptValor   = document.getElementById('valor');

  // máscara simples R$
  iptValor?.addEventListener('input', () => {
    let v = iptValor.value.replace(/\D/g,'');
    if (!v) { iptValor.value = ''; return; }
    v = (parseInt(v,10)/100).toFixed(2).replace('.', ',');
    iptValor.value = v.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  });

  function parseValor(txt) {
    return Number(String(txt||'').replace(/\./g,'').replace(',','.'));
  }

  async function post(url, body, {auth}={}) {
    const headers = { 'Content-Type':'application/json' };
    if (auth) headers.Authorization = 'Bearer ' + auth;
    const r = await fetch(url, { method:'POST', headers, body: JSON.stringify(body) });
    const txt = await r.text();
    let data; try { data = JSON.parse(txt); } catch { data = { error: txt || null }; }
    if (!r.ok) {
      const msg = data?.error || `HTTP ${r.status}`;
      const err = new Error(msg); err.status = r.status; throw err;
    }
    return data;
  }

  async function createOrder(payload) {
    const token = localStorage.getItem(TOKEN_KEY);

    // 1) tenta a rota de cliente (com token do cliente)
    try {
      return await post(`${API}/api/client/orders`, payload, { auth: token });
    } catch (e1) {
      // se 401 aqui: token do cliente expirou
      if (e1?.status === 401) redirectLogin('expired');

      // se 404, tenta rota genérica /api/orders (algumas APIs esperam sem auth)
      if (e1?.status === 404) {
        try {
          return await post(`${API}/api/orders`, payload, { auth: null }); // << sem Authorization
        } catch (e2) {
          // se 401 aqui, a sua API exige credencial de ADMIN nessa rota
          if (e2?.status === 401) throw new Error('A rota /api/orders exige credenciais de admin (401). Ative o POST /api/client/orders no backend ou permita token de cliente.');
          throw e2;
        }
      }
      throw e1;
    }
  }

  // ----- submit -----
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    out.textContent = 'Enviando...';

    const p = new URLSearchParams(location.search);
    const clienteId = p.get('cid') || localStorage.getItem('clienteId') || '';
    const cpf = (p.get('cpf') || localStorage.getItem('cpf') || '').replace(/\D/g,'');

    const product  = iptProduto.value.trim();
    const valorNum = parseValor(iptValor.value);
    if (!product || !valorNum) { out.textContent = 'Preencha produto e valor válidos.'; return; }

    const payload = {
      product, product_name: product,
      value: valorNum, amount: valorNum, value_cents: Math.round(valorNum*100),
      customer_id: clienteId ? Number(clienteId) : undefined,
      cpf: cpf || undefined,
      status: 'pending'
    };

    try {
      const data = await createOrder(payload);
      if (data?.id) try { localStorage.setItem('lastOrderId', String(data.id)); } catch {}

      out.textContent = 'Pedido enviado! Voltando ao portal...';
      setTimeout(() => { location.href = 'portal.html?pedido=enviado'; }, 600);
    } catch (err) {
      console.error('[novo-pedido] erro ao criar pedido:', err);
      out.textContent = err.message || 'Erro ao enviar pedido.';
    }
  });

  // valida sessão ao abrir
  ensureSession();
})();
