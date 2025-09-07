// aprovacoes.js
(function () {
  const CFG = window.APP_CONFIG || {};
  const API = (CFG.API_URL || "").replace(/\/+$/, "");
  const listEl = document.getElementById("orders");

  async function fetchJSON(url, opts={}) {
    const r = await fetch(url, opts);
    const data = await r.json().catch(()=> ({}));
    if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
    return data;
  }

  function card(o){
    const v = Number(o.amount || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    const dt = o.created_at ? new Date(String(o.created_at).replace(' ','T')) : null;
    const when = dt ? dt.toLocaleString('pt-BR') : '—';
    return `
      <div class="order-card">
        <div class="order-left">
          <span class="order-name">${o.customer_name || 'Cliente'}</span>
          <span class="badge negocio">Pedido</span>
          <span class="order-meta">${when}</span>
          <div class="muted">CPF ${o.cpf || ''} · Produto: ${o.product || ''}</div>
        </div>
        <div class="order-valor">${v}</div>
        <div class="order-actions">
          <button class="btn sm primary" data-approve="${o.id}">Aprovar</button>
          <button class="btn sm danger" data-reject="${o.id}">Recusar</button>
        </div>
      </div>
    `;
  }

  async function load(){
    try{
      // usa o alias que você expôs no servidor
      const pendentes = await fetchJSON(`${API}/api/orders/pending?t=${Date.now()}`);
      if (!pendentes.length){
        listEl.classList.add('empty');
        listEl.innerHTML = `<div class="muted">Sem pedidos pendentes.</div>`;
        return;
      }
      listEl.classList.remove('empty');
      listEl.innerHTML = pendentes.map(card).join('');
    }catch(e){
      listEl.innerHTML = `<div class="muted">${e.message}</div>`;
      console.error(e);
    }
  }

  document.addEventListener('click', async (e)=>{
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;

    const idA = t.dataset.approve;
    const idR = t.dataset.reject;

    try{
      if (idA){
        await fetchJSON(`${API}/api/orders/${idA}/approve`, { method:'POST',
          headers:{'Content-Type':'application/json'} });
        await load();
      }
      if (idR){
        await fetchJSON(`${API}/api/orders/${idR}/reject`, { method:'POST',
          headers:{'Content-Type':'application/json'} });
        await load();
      }
    }catch(err){
      alert(err.message);
    }
  });

  document.addEventListener('DOMContentLoaded', load);
})();
