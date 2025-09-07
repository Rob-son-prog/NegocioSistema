// novo-pedido.js
(function () {
  const form  = document.getElementById('formPedido');
  const out   = document.getElementById('out');
  const vProd = document.getElementById('produto');
  const vVal  = document.getElementById('valor');

  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) { location.href = 'acesso-cliente.html'; return; }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    out.textContent = '';

    const product = (vProd?.value || '').trim();
    // aceita 3500, 3500.00, 3.500,00 etc.
    const amount  = Number(String(vVal?.value || '').replace(/\./g,'').replace(',','.'));

    if (!product || !isFinite(amount) || amount <= 0) {
      out.textContent = 'Informe o produto e um valor válido.';
      return;
    }

    try {
      const r = await fetch(`${API}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ product, amount })
      });

      let data = {};
      try { data = await r.json(); } catch {}

      if (!r.ok) {
        out.textContent = `Erro (${r.status}): ${data?.error || 'Falha de requisição'}`;
        console.error('POST /api/orders falhou:', data);
        return;
      }

      out.style.color = '#065f46';
      out.textContent = 'Pedido enviado! Aguarde aprovação.';
      vProd.value = '';
      vVal.value  = '';
    } catch (err) {
      console.error(err);
      out.textContent = 'Erro de rede: ' + (err?.message || 'Falha de conexão');
    }
  });
})();
