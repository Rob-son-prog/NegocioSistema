// dashboard.js - compatível com seu style.css (layout fino + botões pequenos)
const API = 'http://127.0.0.1:4000';
const $ = (s) => document.querySelector(s);

const listEl = $('#ordersRow');
const elKpiRecebidos = $('#kpi-recebidos');

const brl = (v) =>
  (Number(v || 0)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fdate = (iso) => {
  if (!iso) return '—';
  const d = new Date((iso + 'T00:00:00').replace('T00:00:00T', 'T00:00:00'));
  return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
};

async function fetchJSON(url, opts = {}) {
  const r = await fetch(url, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || 'Erro de requisição');
  return data;
}

// === KPI: Recebidos (mês) ===
async function loadKpis() {
  try {
    // mês corrente (a API aceita ?year=YYYY&month=MM, se quiser filtrar outro mês)
    const k = await fetchJSON(`${API}/api/kpis/monthly`);
    if (elKpiRecebidos) elKpiRecebidos.textContent = brl(k.received_total || 0);
  } catch (e) {
    console.error('KPI error', e);
    if (elKpiRecebidos) elKpiRecebidos.textContent = '—';
  }
}
async function loadKPIs() {
  try {
    const r = await fetchJSON(`${API}/api/kpis/recebidos-mes`);
    $('#kpi-recebidos').textContent = brl(r.total || 0);
  } catch (e) {
    console.error(e);
    $('#kpi-recebidos').textContent = '—';
  }
}


// um cartão, fino, usando .order-card e demais classes do seu CSS
function rowTemplate(c) {
  const total = brl(c.total || 0);
  const dt = fdate((c.created_at || '').slice(0, 10));
  const tipo = (c.tipo || 'negocio').toLowerCase(); // negocio | venda
  const tipoClass = tipo === 'venda' ? 'venda' : 'negocio';
  const tipoLabel = tipo === 'venda' ? 'Venda' : 'Negócio';

  return `
    <div class="order-card">
      <div class="order-left">
        <span class="order-name">${c.customer_name || 'Cliente'}</span>
        <span class="badge ${tipoClass}">${tipoLabel}</span>
        <span class="order-meta">${dt}</span>
      </div>
      <div class="order-valor">${total}</div>
      <div class="order-actions">
        <button class="btn sm" data-portal="${c.customer_id}">Portal</button>
        <button class="btn sm primary" data-edit="${c.customer_id}">Editar</button>
        <button class="btn sm danger" data-del="${c.id}">Excluir</button>
      </div>
    </div>
  `;
}

async function loadOrders() {
  try {
    const items = await fetchJSON(`${API}/api/contracts/recent?limit=50`);
    if (!items?.length) {
      listEl.innerHTML = `<div class="muted">Nenhum pedido ainda…</div>`;
      return;
    }
    listEl.innerHTML = items.map(rowTemplate).join('');
  } catch (e) {
    console.error(e);
    listEl.innerHTML = `<div class="muted">${e.message}</div>`;
  }
}

async function boot() {
  await loadKpis();
  await loadOrders();
}

// ações: abrir portal (modo admin), editar (mesmo portal), excluir contrato
document.addEventListener('click', async (e) => {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;

  const portalId = t.dataset.portal;
  const editId = t.dataset.edit;
  const delId = t.dataset.del;

  if (portalId) {
    location.href = `portal.html?id=${portalId}`;
    return;
  }
  if (editId) {
    location.href = `portal.html?id=${editId}`;
    return;
  }
  if (delId) {
    const ok = confirm('Excluir ESTE contrato e TODAS as parcelas?');
    if (!ok) return;
    try {
      await fetchJSON(`${API}/api/contracts/${delId}`, { method: 'DELETE' });
      await loadOrders();
      await loadKpis(); // se apagar contrato com parcelas pagas, atualiza o KPI
    } catch (err) {
      alert(err.message || 'Falha ao excluir.');
    }
  }
});

document.addEventListener('DOMContentLoaded', boot);
