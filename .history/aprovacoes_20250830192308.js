const API = 'http://127.0.0.1:4000';
const $ = s => document.querySelector(s);
const listEl = $('#orders');

async function fetchJSON(url, opts={}) {
  const r = await fetch(url, opts);
  const data = await r.json().catch(()=> ({}));
  if (!r.ok) throw new Error(data?.error || 'internal');
  return data;
}

function card(o){
  const v = Number(o.amount || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  return `
    <div class="order-card">
      <div class="order-left">
        <span class="order-name">${o.customer_name}</span>
        <span class="badge negocio">Pedido</span>
        <span class="order-meta">${new Date(o.created_at+'Z').toLocaleString('pt-BR')}</span>
        <div class="muted">CPF ${o.cpf} · Produto: ${o.product}</div>
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
    const items = await fetchJSON(`${API}/api/orders?status=pendente`);
    listEl.classList.remove('empty');
    listEl.innerHTML = items.length ? items.map(card).join('') : `<div class="muted">Sem pedidos pendentes.</div>`;
  }catch(e){
    listEl.innerHTML = `<div class="muted">${e.message}</div>`;
  }
}

document.addEventListener('click', async (e)=>{
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;

  const idA = t.dataset.approve;
  const idR = t.dataset.reject;

  if (idA){
    try{
      await fetchJSON(`${API}/api/orders/${idA}/approve`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({}) });
      await load();
    }catch(err){ alert(err.message); }
  }

  if (idR){
    try{
      await fetchJSON(`${API}/api/orders/${idR}/reject`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({}) });
      await load();
    }catch(err){ alert(err.message); }
  }
});

document.addEventListener('DOMContentLoaded', load);
