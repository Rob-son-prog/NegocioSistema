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

  function esc(s){ return String(s||'').replace(/"/g,'&quot;'); }

  function card(o){
    const valor = brl(o.value ?? o.amount ?? o.total ?? 0);
    const dtRaw = o.created_at || o.createdAt || o.updated_at || o.updatedAt || '';
    const dt = dtRaw ? new Date(String(dtRaw).replace(' ','T')).toLocaleString('pt-BR') : '—';
    const prod = o.product || '';

    return `
      <div class="order-card" data-id="${o.id}">
        <div class="order-left">
          <span class="order-name">${o.customer_name || o.customer?.name || 'Cliente'}</span>
          <span class="badge negocio">Pedido</span>
          <span class="order-meta">${dt}</span>
          <div class="muted">CPF ${o.cpf || o.customer?.cpf || ''} · Produto: ${prod}</div>
        </div>
        <div class="order-valor">${valor}</div>
        <div class="order-actions">
          <button class="btn sm primary" data-approve="${o.id}" data-product="${esc(prod)}">Aprovar</button>
          <button class="btn sm danger"  data-reject="${o.id}"  data-product="${esc(prod)}">Recusar</button>
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

  // avisa o Portal (BroadcastChannel + fallback localStorage)
  function notifyClients(decision) {
    // decision = { id, status: 'approved'|'rejected', product?: string, note?: string }
    try {
      const bc = new BroadcastChannel('orders');
      bc.postMessage({ type: 'order_decided', ...decision, ts: Date.now() });
      bc.close();
    } catch {}
    try {
      localStorage.setItem('order_evt', JSON.stringify({ type: 'order_decided', ...decision, ts: Date.now() }));
      setTimeout(()=> localStorage.removeItem('order_evt'), 500);
    } catch {}
  }

  document.addEventListener('click', async (e)=>{
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;

    const idA = t.dataset.approve;
    const idR = t.dataset.reject;
    const product = t.dataset.product || '';

    try{
      if (idA){
        await fetchJSON(`${API}/api/orders/${idA}/approve`, {
          method:'POST', headers:{'Content-Type':'application/json'}
        });
        notifyClients({ id: idA, status: 'approved', product });
        await load();
      }
      if (idR){
        // opcional: motivo
        const note = prompt('Motivo da recusa (opcional):') || '';
        await fetchJSON(`${API}/api/orders/${idR}/reject`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ note })
        });
        notifyClients({ id: idR, status: 'rejected', product, note });
        await load();
      }
    }catch(err){
      alert(err.message);
    }
  });

  document.addEventListener('DOMContentLoaded', load);
})();
