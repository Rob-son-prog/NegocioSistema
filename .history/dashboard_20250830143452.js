// dashboard.js
const API = 'http://127.0.0.1:4000';
const $ = (s) => document.querySelector(s);
const brl = (v) => (Number(v || 0)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const listEl = $('#ordersRow');

async function fetchJSON(url, opts = {}) {
  const r = await fetch(url, opts);
  let data = {};
  try { data = await r.json(); } catch {}
  if (!r.ok) throw new Error(data?.error || 'Erro de requisição');
  return data;
}

function rowTemplate(c) {
  // Esperado de /api/contracts/recent:
  // { id, customer_id, customer_name, tipo, created_at, total }
  const total = brl(c.total || 0);
  const dt    = (c.created_at || '').slice(0, 10);
  const tipo  = c.tipo ? (String(c.tipo).charAt(0).toUpperCase() + String(c.tipo).slice(1)) : 'Negócio';
  const nome  = c.customer_name || 'Cliente';

  return `
    <div class="order-row">
      <div class="order-main">
        <strong>${nome}</strong>
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
  if (!listEl) return;
  try {
    const items = await fetchJSON(`${API}/api/contracts/recent?limit=50`);
    if (!items || items.length === 0) {
      listEl.dataset.empty = 'true';
      listEl.textContent = 'Nenhum pedido ainda…';
      return;
    }
    listEl.dataset.empty = 'false';
    listEl.innerHTML = items.map(rowTemplate).join('');
  } catch (e) {
    console.error(e);
    listEl.dataset.empty = 'true';
    listEl.textContent = e.message;
  }
}

async function onClick(e) {
  const btn = e.target;
  if (!btn || !btn.closest('.orders-row')) return;

  const portalId = btn.dataset.portal;
  const editId   = btn.dataset.edit;
  const delId    = btn.dataset.del;

  if (portalId) {
    // Abre o portal em modo admin (consegue ver/baixar parcelas)
    location.href = `portal.html?id=${portalId}`;
    return;
  }

  if (editId) {
    // Alias do portal — edição das parcelas/contratos faremos por lá
    location.href = `portal.html?id=${editId}`;
    return;
  }

  if (delId) {
    if (!confirm('Tem certeza que deseja EXCLUIR este contrato e TODAS as parcelas dele?')) return;
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
