// dashboard.js — KPIs + lista e alerta visual (borda) por parcelas vencidas/hoje
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
  // Recebidos (mês)
  try {
    const r = await fetchJSON(`${API}/api/kpis/recebidos-mes`);
    if (elKpiRecebidos) elKpiRecebidos.textContent = brl(r.total || 0);
  } catch {
    if (elKpiRecebidos) elKpiRecebidos.textContent = '—';
  }

  try {
    const contracts = await getAllContracts();

    // Negócios feitos (soma do total inicial dos contratos não removidos)
    const negocios = contracts
      .filter(c => !isRemoved(c))
      .reduce((s, c) => s + getInitialTotal(c), 0);
    if (elKpiNegocios) elKpiNegocios.textContent = brl(negocios);

    // Vendas (mês) — contratos criados no mês corrente
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
  const total = brl(asNumberTotal(c));
  const dt = fdate((pickCreatedAt(c) || '').slice?.(0, 10) || pickCreatedAt(c));
  const tipo = (c.tipo || 'negocio').toLowerCase();
  const tipoClass = tipo === 'venda' ? 'venda' : 'negocio';
  const tipoLabel = tipo === 'venda' ? 'Venda' : 'Negócio';

  // id do card = c-<contract_id> e data-customer pro fetch rápido
  return `
    <div class="order-card" id="c-${c.id}" data-customer="${c.customer_id}">
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

    // Após renderizar, checar parcelas e colorir a borda
    markOverdues(items);
  } catch (e) {
    console.error(e);
    listEl.innerHTML = `<div class="muted">${e.message}</div>`;
  }
}

// ---------- marca borda conforme parcelas ----------
function isoToDate(d) { return new Date(`${d}T00:00:00Z`); }
function isTodayISO(d) {
  const today = new Date();
  const a = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const b = isoToDate(d);
  return a.getTime() === b.getTime();
}
function isPastISO(d) {
  const today = new Date();
  const a = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const b = isoToDate(d);
  return b.getTime() < a.getTime();
}

async function markOverdues(contracts) {
  // agrupa contratos por cliente (um fetch por cliente)
  const byCustomer = new Map();
  for (const c of contracts) {
    if (!byCustomer.has(c.customer_id)) byCustomer.set(c.customer_id, []);
    byCustomer.get(c.customer_id).push(c.id);
  }

  for (const [customerId, contractIds] of byCustomer.entries()) {
    try {
      const data = await fetchJSON(`${API}/api/admin/portal/${customerId}`);
      const inst = Array.isArray(data?.installments) ? data.installments : [];

      const pendentes = inst.filter(i => String(i.status || '').toLowerCase() !== 'pago');

      const temAtraso = pendentes.some(i => i.due && isPastISO(i.due));
      const venceHoje = !temAtraso && pendentes.some(i => i.due && isTodayISO(i.due));

      for (const contractId of contractIds) {
        const el = document.getElementById(`c-${contractId}`);
        if (!el) continue;

        el.classList.remove('danger', 'warn');
        el.style.border = ''; // fallback, caso CSS não esteja com classes

        if (temAtraso) {
          el.classList.add('danger');
          if (!el.style.border) el.style.border = '2px solid #ef4444';
        } else if (venceHoje) {
          el.classList.add('warn');
          if (!el.style.border) el.style.border = '2px solid #f59e0b';
        }
      }
    } catch (err) {
      console.debug('markOverdues falhou para cliente', customerId, err?.message || err);
    }
  }
}

// ---------- boot ----------
async function boot() {
  await loadKPIs();
  await loadOrders();
}

// ---------- ações ----------
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
    location.href = `editar-cliente.html?id=${editId}`;
    return;
  }

  if (delId) {
    const ok = confirm('Excluir ESTE contrato e TODAS as parcelas?');
    if (!ok) return;

    const code = prompt('Digite o código de exclusão:');
    if (code === null) return;
    if (!code.trim()) { alert('Código obrigatório.'); return; }

    try {
      const r = await fetch(`${API}/api/contracts/${delId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'X-Delete-Code': code, // senha (ex.: 116477)
        },
      });
      const data = await r.json().catch(() => ({}));

      if (!r.ok) {
        alert(data?.error || `Falha ao excluir (HTTP ${r.status}).`);
        return;
      }

      forgetInitialTotal?.(delId);
      await loadOrders();
      await loadKPIs();
    } catch (err) {
      alert(err.message || 'Falha ao excluir.');
    }
  }
});

document.addEventListener('DOMContentLoaded', boot);
