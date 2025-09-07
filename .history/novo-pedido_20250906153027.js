(() => {
  const API = window.API || (window.APP_CONFIG?.API_URL || 'http://127.0.0.1:4000');
  const TOKEN_KEY = 'client_token';

  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    location.replace('acesso-cliente.html?redirect=' + encodeURIComponent(location.pathname + location.search));
    return;
  }

  const p = new URLSearchParams(location.search);
  const clienteId = p.get('cid') || p.get('id') || localStorage.getItem('clienteId') || '';

  const form = document.getElementById('formPedido');
  const out  = document.getElementById('out');
  const iptProduto = document.getElementById('produto');
  const iptValor   = document.getElementById('valor');

  iptValor.addEventListener('input', () => {
    let v = iptValor.value.replace(/\D/g,'');
    if (!v) { iptValor.value = ''; return; }
    v = (parseInt(v,10)/100).toFixed(2).replace('.', ',');
    iptValor.value = v.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    out.textContent = 'Enviando...';

    const product = iptProduto.value.trim();
    const valorNum = Number(iptValor.value.replace(/\./g,'').replace(',','.'));
    if (!product || !valorNum) { out.textContent = 'Preencha produto e valor válidos.'; return; }

    const cpf = (p.get('cpf') || localStorage.getItem('cpf') || '').replace(/\D/g,'');
    const payload = {
      product, product_name: product,
      value: valorNum, amount: valorNum, value_cents: Math.round(valorNum*100),
      customer_id: clienteId ? Number(clienteId) : undefined,
      cpf: cpf || undefined,
      status: 'pending'
    };

    async function post(url) {
      const r = await fetch(url, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+token },
        body: JSON.stringify(payload)
      });
      const txt = await r.text();
      let data; try { data = JSON.parse(txt); } catch { data = { error: txt || null }; }
      if (!r.ok) throw new Error(`HTTP ${r.status} – ${data?.error || txt || 'erro desconhecido'}`);
      return data;
    }

    try {
      const base = API.replace(/\/+$/,'');
      let data;
      try { data = await post(`${base}/api/client/orders`); }
      catch (e1) {
        if (String(e1.message||'').includes('404')) data = await post(`${base}/api/orders`);
        else throw e1;
      }
      if (data?.id) localStorage.setItem('lastOrderId', String(data.id));
      out.textContent = 'Pedido enviado! Voltando ao portal...';
      // ⚠️ volta ao portal do cliente (não abre aprovações)
      setTimeout(() => { location.href = 'portal.html?pedido=enviado'; }, 600);

    } catch (err) {
      console.error('[novo-pedido] erro ao criar pedido:', err);
      out.textContent = err.message || 'Erro ao enviar pedido.';
    }
  });
})();
