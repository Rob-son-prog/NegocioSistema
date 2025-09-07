const API = 'http://localhost:4000';
const ORDERS_KEY = 'recentOrders';

let recentOrders = [];

function loadOrders() {
  try { recentOrders = JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]'); }
  catch { recentOrders = []; }
}

// ---- RENDERIZA OS PEDIDOS (um embaixo do outro) ----
function renderOrders() {
  const wrap = document.getElementById('ordersRow');
  if (!wrap) return;

  wrap.classList.add('orders-row');     // garante layout em coluna
  wrap.innerHTML = '';

  if (!recentOrders.length) {
    wrap.classList.add('empty');
    wrap.textContent = 'Nenhum pedido ainda…';
    return;
  }
  wrap.classList.remove('empty');

  const fmtBR = n => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  recentOrders.forEach(p => {
    const el = document.createElement('div');
    el.className = 'order-card';

    // monta querystring do portal
    const qs = new URLSearchParams({ id: String(p.id || '') });
    if (p.customer_id) qs.set('cid', String(p.customer_id));

    el.innerHTML = `
      <div class="order-left">
        <div class="order-name">${p.cliente || '—'}</div>
        <div class="order-meta">
          <span class="badge ${p.tipo === 'venda' ? 'venda' : 'negocio'}">
            ${p.tipo === 'venda' ? 'Venda' : 'Negócio'}
          </span>
          <span>${p.parcelas || 1}x</span>
          <span>${p.data || ''}</span>
          <span class="pill ${p.status || 'aberto'}">${(p.status || 'aberto') === 'pago' ? 'Pago' : (p.status === 'atrasado' ? 'Atrasado' : 'Aberto')}</span>
        </div>
      </div>

      <div class="order-valor">${fmtBR(p.valor)}</div>

      <div class="order-actions">
        <button class="btn sm" data-edit="${p.id}">Editar</button>
        <a class="btn sm" href="portal.html?${qs.toString()}">Portal</a>
      </div>
    `;
    wrap.appendChild(el);
  });
}

// delegação de cliques para Editar (apenas 1 listener)
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-edit]');
  if (!btn) return;
  const id = btn.getAttribute('data-edit');
  if (!id) return;
  location.href = `cadastro.html?edit=${encodeURIComponent(id)}`;
});

document.addEventListener('DOMContentLoaded', () => {
  loadOrders();
  renderOrders();
  if (typeof loadSummary === 'function') loadSummary(); // chama se existir
});

