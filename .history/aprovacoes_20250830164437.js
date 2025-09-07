// aprovacoes.js
const API = 'http://127.0.0.1:4000';
const $ = (s) => document.querySelector(s);
const brl = (v) => (Number(v||0)).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fdate = (iso) => iso ? new Date(iso.replace(' ','T')+'Z').toLocaleString('pt-BR') : '—';

async function fetchJSON(url, opts={}){
  const r = await fetch(url, opts);
  const data = await r.json().catch(()=> ({}));
  if(!r.ok) throw new Error(data?.error || 'Erro de requisição');
  return data;
}

function row(o){
  return `
    <div class="order-card">
      <div class="order-left">
        <span class="order-name">${o.customer_name}</span>
        <span class="badge negocio">Pedido</span>
        <span class="order-meta">${fdate(o.created_at)}</span>
        <span class="order-meta">CPF ${o.cpf || '—'}</span>
        <span class="order-meta">Produto: <strong>${o.product}</strong></span>
      </div>
      <div class="order-valor">${brl(o.amount)}</div>
      <div class="order-actions">
        <button class="btn sm primary" data-approve="${o.id}">Aprovar</button>
        <button class="btn sm danger"  data-reject="${o.id}">Recusar</button>
      </div>
    </div>
  `;
}

async function load(){
  const box = $('#orders');
  try{
    const list = await fetchJSON(`${API}/api/orders?status=pendente`);
    if(!list.length){ box.classList.add('empty'); box.textContent = 'Sem pedidos pendentes.'; return; }
    box.classList.remove('empty');
    box.innerHTML = list.map(row).join('');
  }catch(e){
    console.error(e);
    box.classList.add('empty');
    box.textContent = e.message;
  }
}

document.addEventListener('click', async (e)=>{
  const t = e.target;
  if(!(t instanceof HTMLElement)) return;
  const idA = t.dataset.approve;
  const idR = t.dataset.reject;
  try{
    if(idA){
      await fetchJSON(`${API}/api/orders/${idA}/approve`, { method:'POST' });
      await load();
    }else if(idR){
      await fetchJSON(`${API}/api/orders/${idR}/reject`, { method:'POST' });
      await load();
    }
  }catch(err){
    alert(err.message || 'Falha');
  }
});

document.addEventListener('DOMContentLoaded', load);
