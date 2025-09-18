// dashboard.js - KPIs robustos: "Negócios" usa total inicial imutável por contrato
const API = 'http://127.0.0.1:4000';
const $ = (s) => document.querySelector(s);

const listEl          = $('#ordersRow');
const elKpiRecebidos  = $('#kpi-recebidos');
const elKpiNegocios   = $('#kpi-negocios');
const elKpiVendas     = $('#kpi-vendas');

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
  if (!r.ok) throw new Error(data?.error || `Erro de requisição: ${url}`);
  return data;
}



// ---------- datas/estados ----------
function monthRange(d = new Date()) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end   = new Date(d.getFullYear(), d.getMonth() + 1, 1); // exclusivo
  return { start, end };
}
function inMonth(dateStr, { start, end }) {
  if (!dateStr) return false;
  const dt = new Date(String(dateStr).replace(' ', 'T'));
  return dt >= start && dt < end;
}
function isRemoved(x) {
  const st = String(x?.status || '').toLowerCase();
  return !!(
    x?.deleted || x?.is_deleted || x?.excluido || x?.deleted_at || x?.removed_at ||
    st === 'cancelado' || st === 'excluido' || st === 'excluído'
  );
}
function asNumberTotal(c) {
  return Number(c.total ?? c.value ?? c.amount ?? c.contract_total ?? 0);
}
function pickCreatedAt(c) {
  return c.created_at || c.createdAt || c.data || c.dt || null;
}

// ---------- total imutável (cache local) ----------
const initKey = (id) => `kpi:contract:${id}:initial_total`;
function getInitialTotal(c) {
  const id = c?.id;
  const current = asNumberTotal(c);
  if (!id) return current;
  try {
    const cached = localStorage.getItem(initKey(id));
    if (cached != null && cached !== '') return Number(cached);
    // primeira vez que vemos esse contrato → congela o total inicial
    localStorage.setItem(initKey(id), String(current));
  } catch {}
  return current;
}
function forgetInitialTotal(id) {
  try { localStorage.removeItem(initKey(id)); } catch {}
}

// ---------- tenta várias rotas até listar todos os contratos ----------
async function getAllContracts() {
  const endpoints = [
    `${API}/api/contracts?all=1`,
    `${API}/api/contracts`,
    `${API}/api/contracts/list`,
    `${API}/api/admin/contracts`,
    `${API}/api/contracts/recent?limit=1000`,
  ];
  for (const url of endpoints) {
    try {
      const data = await fetchJSON(url);
      if (Array.isArray(data) && data.length) return data;
      if (Array.isArray(data?.items) && data.items.length) return data.items;
    } catch (_) {}
  }
  return [];
}

// === KPIs ===
async function loadKPIs() {
  // Recebidos (mês) — mantém seu endpoint
  try {
    const r = await fetchJSON(`${API}/api/kpis/recebidos-mes`);
    if (elKpiRecebidos) elKpiRecebidos.textContent = brl(r.total || 0);
  } catch {
    if (elKpiRecebidos) elKpiRecebidos.textContent = '—';
  }

  try {
    const contracts = await getAllContracts();

    // Negócios feitos = soma de todos os contratos não removidos (total inicial)
    const negocios = contracts
      .filter(c => !isRemoved(c))
      .reduce((s, c) => s + getInitialTotal(c), 0);
    if (elKpiNegocios) elKpiNegocios.textContent = brl(negocios);

    // Vendas (mês) = soma dos contratos criados no mês corrente (total inicial)
    const { start, end } = monthRange();
    const vendasMes = contracts
      .filter(c => !isRemoved(c) && inMonth(pickCreatedAt(c), { start, end }))
      .reduce((s, c) => s + getInitialTotal(c), 0);
    if (elKpiVendas) elKpiVendas.textContent = brl(vendasMes);
  } catch (e) {
    console.error('KPI error', e);
    if (elKpiNegocios) elKpiNegocios.textContent = '—';
    if (elKpiVendas)   elKpiVendas.textContent   = '—';
  }
}

// === Lista de contratos recentes (cards finos) ===
function rowTemplate(c) {
  const total = brl(asNumberTotal(c)); // exibição pode ser o atual
  const dt = fdate((pickCreatedAt(c) || '').slice?.(0, 10) || pickCreatedAt(c));
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
  await loadKPIs();
  await loadOrders();
}

// Ações: abrir portal (modo admin), editar (mesmo portal), excluir contrato
document.addEventListener('click', async (e) => {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;

  const portalId = t.dataset.portal;
  const editId   = t.dataset.edit;
  const delId    = t.dataset.del;

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
      // apaga o cache do total inicial para esse contrato
      forgetInitialTotal(delId);
      await loadOrders();
      await loadKPIs(); // atualiza KPIs após excluir
    } catch (err) {
      alert(err.message || 'Falha ao excluir.');
    }
  }
});

document.addEventListener('DOMContentLoaded', boot);
