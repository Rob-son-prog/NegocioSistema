// dashboard.js - compatível com seu style.css (layout fino + botões pequenos)
const API = 'http://127.0.0.1:4000';
const $ = (s) => document.querySelector(s);
const brl = (v) => (Number(v || 0)).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });

const elKpiRecebidos = $('#kpi-recebidos');

// ...

async function loadKpis() {
  try {
    // mês corrente; se quiser outro, passe ?year=YYYY&month=MM
    const k = await fetchJSON(`${API}/api/kpis/monthly`);
    if (elKpiRecebidos) elKpiRecebidos.textContent = brl(k.received_total || 0);
  } catch (e) {
    console.error('KPI error', e);
    if (elKpiRecebidos) elKpiRecebidos.textContent = '—';
  }
}

async function load() {
  await loadKpis(); // ← chama antes (ou depois) dos pedidos
  try {
    const items = await fetchJSON(`${API}/api/contracts/recent?limit=50`);
    if (!listEl) return;
    listEl.innerHTML = items.map(rowTemplate).join('') || '<p class="muted">Sem registros.</p>';
  } catch (e) {
    console.error(e);
    if (listEl) listEl.innerHTML = `<p class="muted">${e.message}</p>`;
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

async function load() {
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
      await load();
    } catch (err) {
      alert(err.message || 'Falha ao excluir.');
    }
  }
});

document.addEventListener('DOMContentLoaded', load);
