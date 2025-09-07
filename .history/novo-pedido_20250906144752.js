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

  // máscara simples R$
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

    try {
      const res = await fetch(`${API.replace(/\/+$/,'')}/api/client/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token
        },
        body: JSON.stringify({ product, value: valorNum, customer_id: clienteId || undefined })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Falha ao solicitar o pedido');

      // guarda id para referência na aprovação (opcional)
      if (data?.id) localStorage.setItem('lastOrderId', String(data.id));

      out.textContent = 'Pedido enviado! Abrindo aprovações...';
      // 👉 vai para a fila de aprovações
      setTimeout(() => { location.href = 'aprovacoes.html'; }, 600);
    } catch (err) {
      out.textContent = err.message || 'Erro ao enviar pedido.';
      console.error(err);
    }
  });
})();
