const API = 'http://localhost:4000';
const ORDERS_KEY = 'recentOrders';

// ---------- utils ----------
function toNumberBR(v) {
  if (typeof v !== 'string') return Number(v || 0);
  return Number(v.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
}
function fmtBR(n) {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function isoHoje() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
function uid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'o_' + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function saveOrders(list) {
  localStorage.setItem(ORDERS_KEY, JSON.stringify(list.slice(0, 20)));
}
function pushOrderLocally(pedido) {
  const list = JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]');
  list.unshift(pedido);
  saveOrders(list);
}

// ---------- página ----------
document.addEventListener('DOMContentLoaded', () => {
  const f = document.getElementById('cadForm');
  if (!f) return;

  // pegar pelos names do HTML
  const nome      = f.elements['nome'];
  const cpf       = f.elements['cpf'];
  const endereco  = f.elements['endereco'];
  const cep       = f.elements['cep'];
  const indicacao = f.elements['indicacao'];
  const tipoField = f.elements['tipo'];      // select (ou rádios name="tipo")
  const valor     = f.elements['valor'];     // base
  const margem    = f.elements['margem'];    // % ao mês
  const parcelas  = f.elements['parcelas'];
  const firstDue  = f.elements['first_due'];

  const outTotal   = document.getElementById('valorTotal');
  const outParcela = document.getElementById('valorParcela');
  const statusMsg  = document.getElementById('status');

  if (!firstDue.value) firstDue.value = isoHoje();

  // cálculo (juros simples ao mês): total = base * (1 + mg/100 * n)
  function recalc() {
    const base = toNumberBR(valor?.value || 0);
    const mg   = Number(margem?.value || 0);
    const n    = Math.max(1, Number(parcelas?.value || 1));

    const total = +(base * (1 + (mg / 100) * n)).toFixed(2);
    const parc  = +(total / n).toFixed(2);

    if (outTotal)   outTotal.value   = fmtBR(total);
    if (outParcela) outParcela.value = fmtBR(parc);
  }
  ['input', 'change'].forEach(ev => {
    valor?.addEventListener(ev, recalc);
    margem?.addEventListener(ev, recalc);
    parcelas?.addEventListener(ev, recalc);
  });
  recalc();

  // CEP -> endereço (ViaCEP)
  async function buscaCEP() {
    try {
      const d = (cep?.value || '').replace(/\D/g, '');
      if (d.length !== 8) return;
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      const j = await r.json();
      if (!j || j.erro) return;
      const txt = [j.logradouro, j.bairro, `${j.localidade}/${j.uf}`].filter(Boolean).join(', ');
      if (endereco && !endereco.value) endereco.value = txt;
    } catch {
      /* ignore */
    }
  }
  cep?.addEventListener('change', buscaCEP);
  cep?.addEventListener('blur', buscaCEP);

  // ----- modo edição (via ?edit=<id>) -----
  const params = new URLSearchParams(location.search);
  let editingId = params.get('edit') || null;

  if (editingId) {
    const list = JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]');
    const ped  = list.find(p => p.id === editingId);
    if (ped) {
      nome.value       = ped.cliente || '';
      // radios ou select:
      const radio = f.querySelector(`input[name="tipo"][value="${ped.tipo}"]`);
      if (radio) radio.checked = true;
      else if (tipoField && 'value' in tipoField) tipoField.value = ped.tipo || 'negocio';

      valor.value      = ped.valorBase != null ? ped.valorBase : (ped.valor || '');
      margem.value     = ped.margem != null ? ped.margem : 0;
      parcelas.value   = ped.parcelas || 1;
      firstDue.value   = ped.data || isoHoje();
      indicacao.value  = ped.indicacao || '';
      recalc();
    }
  }

  // submit
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (statusMsg) statusMsg.textContent = 'Salvando…';

    const cliente   = (nome?.value || '').trim();
    const base      = toNumberBR(valor?.value || 0);
    const mg        = Number(margem?.value || 0);
    const n         = Math.max(1, Number(parcelas?.value || 1));
    const primeira  = firstDue?.value || isoHoje();
    const totalComMargem = +(base * (1 + (mg / 100) * n)).toFixed(2);

    // tipo (radios ou select)
    let tipo = 'negocio';
    const checkedRadio = f.querySelector('input[name="tipo"]:checked');
    if (checkedRadio) tipo = checkedRadio.value;
    else if (tipoField && 'value' in tipoField) tipo = tipoField.value;

    // dados que vamos gravar localmente
    const orderData = {
      id: editingId || uid(),
      cliente,
      tipo,                       // 'negocio' | 'venda'
      valor: totalComMargem,      // total com margem
      valorBase: base,
      margem: mg,
      parcelas: n,
      data: primeira,             // yyyy-mm-dd
      indicacao: (indicacao?.value || '').trim(),
      status: 'aberto',           // pronto pro futuro: 'pago' | 'atrasado'
      customer_id: null,
      contract_id: null,
    };

    // opcional: backend (só cria quando for novo)
    try {
      if (!editingId) {
        const token = localStorage.getItem('token');
        const hdrs  = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

        const rc = await fetch(`${API}/api/customers`, {
          method: 'POST', headers: hdrs,
          body: JSON.stringify({
            name: cliente, email: '', phone: cpf?.value || '',
            address: endereco?.value || '', zip: cep?.value || ''
          })
        });
        const cust = await rc.json(); if (!rc.ok) throw new Error(cust.error || 'Erro ao criar cliente');

        const rct = await fetch(`${API}/api/contracts`, {
          method: 'POST', headers: hdrs,
          body: JSON.stringify({
            customer_id: cust.customer.id,
            total: orderData.valor,
            parcelas: n,
            first_due: primeira
          })
        });
        const cont = await rct.json(); if (!rct.ok) throw new Error(cont.error || 'Erro ao criar contrato');

        // guarde os IDs para o portal do cliente
        orderData.customer_id = cust.customer.id;
        orderData.contract_id = cont.contract_id;
      }
    } catch (err) {
      console.warn('Backend falhou (seguindo mesmo assim):', err);
    }

    // salva local (novo ou edição)
    const list = JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]');
    if (editingId) {
      const i = list.findIndex(p => p.id === editingId);
      if (i >= 0) list[i] = orderData; else list.unshift(orderData);
      saveOrders(list);
    } else {
      pushOrderLocally(orderData);
    }

    if (statusMsg) statusMsg.textContent = 'Salvo! Redirecionando…';
    location.href = 'dashboard.html';
  });
});
