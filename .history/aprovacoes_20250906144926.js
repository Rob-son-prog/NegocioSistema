// aprovacoes.js
(function () {
  const CFG = window.APP_CONFIG || {};
  const API = (CFG.API_URL || "http://127.0.0.1:4000").replace(/\/+$/, "");
  const listEl = document.getElementById("orders");

  async function fetchJSON(url, opts={}) {
    const r = await fetch(url, opts);
    const data = await r.json().catch(()=> ({}));
    if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
    return data;
  }

  const brl = (n) => Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

  function card(o){
    const valor = brl(o.value ?? o.amount ?? o.total ?? 0);
    const dtRaw = o.created_at || o.createdAt || o.updated_at || o.updatedAt || '';
    const dt = dtRaw ? new Date(String(dtRaw).replace(' ','T')).toLocaleString('pt-BR') : '—';

    return `
      <div class="order-card">
        <div class="order-left">
          <span class="order-name">${o.customer_name || o.customer?.name || 'Cliente'}</span>
          <span class="badge negocio">Pedido</span>
          <span class="order-meta">${dt}</span>
          <div class="muted">CPF ${o.cpf || o.customer?.cpf || ''} · Produto: ${o.product || ''}</div>
        </div>
        <div class="order-valor">${valor}</div>
        <div class="order-actions">
          <button class="btn sm primary" data-approve="${o.id}">Aprovar</button>
          <button class="btn sm danger"  data-reject="${o.id}">Recusar</button>
        </div>
      </div>
    `;
  }

  async function load(){
    try{
      const pendentes = await fetchJSON(`${API}/api/orders/pending?t=${Date.now()}`);
      if (!Array.isArray(pendentes) || !pendentes.length){
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
        await fetchJSON(`${API}/api/orders/${idA}/approve`, {
          method:'POST', headers:{'Content-Type':'application/json'}
        });
        await load();
      }
      if (idR){
        await fetchJSON(`${API}/api/orders/${idR}/reject`, {
          method:'POST', headers:{'Content-Type':'application/json'}
        });
        await load();
      }
    }catch(err){
      alert(err.message);
    }
  });

  document.addEventListener('DOMContentLoaded', load);
})();
