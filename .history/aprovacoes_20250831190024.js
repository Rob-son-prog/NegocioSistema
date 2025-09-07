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
    // sem filtro + quebra de cache
    const all = await fetchJSON(`${API}/api/orders?t=${Date.now()}`);
    const pendentes = all.filter(o => (o.status || '').toLowerCase() === 'pendente');

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

  if (idA){
    try{
      await fetchJSON(`${API}/api/orders/${idA}/approve`, { method:'POST', headers:{'Content-Type':'application/json'} });
      await load();
    }catch(err){ alert(err.message); }
  }

  if (idR){
    try{
      await fetchJSON(`${API}/api/orders/${idR}/reject`, { method:'POST', headers:{'Content-Type':'application/json'} });
      await load();
    }catch(err){ alert(err.message); }
  }
});

document.addEventListener('DOMContentLoaded', load);
