// dashboard.js
const API = 'http://127.0.0.1:4000';
const $ = (s) => document.querySelector(s);
const brl = (v) => (Number(v || 0)).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });

const listEl = document.querySelector('.list') || $('#recent'); // use o container que você já tem

async function fetchJSON(url, opts={}) {
  const r = await fetch(url, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || 'Erro de requisição');
  return data;
}

function rowTemplate(c) {
  // cada item deve vir de /api/contracts/recent com: id do contrato, customer_id, customer_name, tipo, created_at, total etc.
  const total = brl(c.total || 0);
  const dt    = (c.created_at || '').slice(0,10);
  const tipo  = (c.tipo || 'Negócio');
  return `
    <div class="order-row">
      <div class="order-main">
        <strong>${c.customer_name || 'Cliente'}</strong>
        <span class="muted">${tipo}</span>
        <span class="muted">${dt}</span>
      </div>
      <div class="order-right">
        <span class="muted">${total}</span>
        <button class="btn sm" data-portal="${c.customer_id}">Portal</button>
        <button class="btn sm primary" data-edit="${c.customer_id}">Editar</button>
        <button class="btn sm danger" data-del="${c.id}">Excluir</button>
      </div>
    </div>
  `;
}

async function load() {
  try {
    const items = await fetchJSON(`${API}/api/contracts/recent?limit=50`);
    if (!listEl) return;
    listEl.innerHTML = items.map(rowTemplate).join('') || '<p class="muted">Sem registros.</p>';
  } catch (e) {
    console.error(e);
    if (listEl) listEl.innerHTML = `<p class="muted">${e.message}</p>`;
  }
}

async function onClick(e) {
  const portalId = e.target.dataset.portal;
  const editId   = e.target.dataset.edit;
  const delId    = e.target.dataset.del;

  if (portalId) {
    // abre o portal em modo admin (pode editar parcelas lá)
    location.href = `portal.html?id=${portalId}`;
    return;
  }

  if (editId) {
    // igual ao portal (só um alias visual)
    location.href = `portal.html?id=${editId}`;
    return;
  }

  if (delId) {
    if (!confirm('Tem certeza que deseja EXCLUIR este contrato e todas as parcelas?')) return;
    try {
      await fetchJSON(`${API}/api/contracts/${delId}`, { method: 'DELETE' });
      await load();
    } catch (e2) {
      alert(e2.message || 'Falha ao excluir.');
    }
  }
}

document.addEventListener('DOMContentLoaded', load);
document.addEventListener('click', onClick);
