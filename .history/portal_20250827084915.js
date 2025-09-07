const ORDERS_KEY = 'recentOrders';

const $ = (s) => document.querySelector(s);
const fmtBR = (n) =>
  Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function addMonths(iso, n) {
  const [y, m, d] = (iso || '1970-01-01').split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setMonth(dt.getMonth() + n);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function loadList() {
  try { return JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]'); }
  catch { return []; }
}
function saveList(list) {
  localStorage.setItem(ORDERS_KEY, JSON.stringify(list.slice(0, 200)));
}

function ensureSchedule(order) {
  const n = Math.max(1, Number(order.parcelas || 1));
  if (Array.isArray(order.payments) && order.payments.length === n) return;

  const total = Number(order.valor || 0);
  const unit = Math.floor((total / n) * 100) / 100; // em centavos, arredonda p/ baixo
  let last = +(total - unit * (n - 1)).toFixed(2);

  order.payments = [];
  for (let i = 1; i <= n; i++) {
    order.payments.push({
      num: i,
      due: addMonths(order.data, i - 1),
      amount: i < n ? unit : last,
      status: 'open',   // open | late | paid
      paid_at: null,
      txid: null
    });
  }
}

function recomputeStatus(order) {
  const today = new Date().toISOString().slice(0, 10);
  let paid = 0, late = 0;
  order.payments.forEach(p => {
    if (p.status !== 'paid') {
      p.status = (p.due < today) ? 'late' : 'open';
    }
    if (p.status === 'paid') paid++;
    if (p.status === 'late') late++;
  });
  order.status = (paid === order.payments.length) ? 'pago' : (late > 0 ? 'atrasado' : 'aberto');
}

function persist(order) {
  const list = loadList();
  const i = list.findIndex(o => o.id === order.id);
  if (i >= 0) list[i] = order; else list.unshift(order);
  saveList(list);
}

function render(order) {
  $('#clienteNome').textContent = order.cliente || 'Cliente';
  $('#clienteMeta').textContent = `${order.parcelas}x • primeiro venc. ${order.data}`;
  $('#k-total').textContent = fmtBR(order.valor);
  $('#k-pagas').textContent = String(order.payments.filter(p => p.status === 'paid').length);

  const st = $('#k-status');
  st.textContent = order.status[0].toUpperCase() + order.status.slice(1);
  st.className = `pill ${order.status}`;

  const wrap = $('#parcelas');
  wrap.innerHTML = '';

  order.payments.forEach(p => {
    const row = document.createElement('div');
    row.className = 'parcel-row';
    row.innerHTML = `
      <div class="parcel-col left">
        <div class="p-title">Parcela ${p.num} — <strong>${fmtBR(p.amount)}</strong></div>
        <div class="p-meta">
          Venc.: ${p.due} ·
          <span class="pill ${p.status}">
            ${p.status === 'paid' ? 'Pago' : (p.status === 'late' ? 'Atrasado' : 'Aberto')}
          </span>
          ${p.paid_at ? `· pago em ${p.paid_at}` : ''}
        </div>
      </div>
      <div class="parcel-col actions">
        <button class="btn sm" data-pix="${p.num}">Gerar PIX</button>
        ${p.status !== 'paid' ? `<button class="btn sm primary" data-pay="${p.num}">Baixar</button>` : ''}
      </div>
    `;
    wrap.appendChild(row);
  });

  // ações
  wrap.onclick = (e) => {
    const num = e.target.dataset.pay || e.target.dataset.pix;
    if (!num) return;
    const i = order.payments.findIndex(pp => String(pp.num) === String(num));
    if (i < 0) return;

    if (e.target.dataset.pay) {
      order.payments[i].status = 'paid';
      order.payments[i].paid_at = new Date().toISOString().slice(0, 10);
      recomputeStatus(order);
      persist(order);
      render(order);
    } else {
      // PIX DEMO – futuramente substituímos por integração real
      const code = `PIX|ORDER:${order.id}|PARC:${num}|VALOR:${order.payments[i].amount}|TS:${Date.now()}`;
      alert('PIX (exemplo)\n\nCopie e cole no app do banco:\n' + code);
    }
  };
}

(function init() {
  const id = new URLSearchParams(location.search).get('id');
  const list = loadList();
  const order = list.find(o => o.id === id);
  const msg = $('#msg');

  if (!order) {
    msg.textContent = 'Pedido não encontrado.';
    return;
  }

  if (!order.data) order.data = new Date().toISOString().slice(0, 10);
  ensureSchedule(order);
  recomputeStatus(order);
  persist(order);
  render(order);
})();

// ===== Capa do cliente (portal) =====
(function initCoverFeature(){
  const params = new URLSearchParams(location.search);
  // Preferimos salvar por cliente (cid). Se não vier, cai para id/oid do pedido.
  const idFromUrl  = params.get('id') || params.get('oid');
  const cidFromUrl = params.get('cid');
  const coverKey   = `cover:${cidFromUrl || idFromUrl || 'sem-id'}`;

  const img   = document.getElementById('coverImg');
  const input = document.getElementById('coverInput');
  const btnUp = document.getElementById('btnChangeCover');
  const btnRm = document.getElementById('btnRemoveCover');

  if (!img || !input || !btnUp || !btnRm) return;

  // Carrega capa se existir
  try {
    const dataUrl = localStorage.getItem(coverKey);
    if (dataUrl) {
      img.src = dataUrl;
      img.style.display = 'block';
    }
  } catch {}

  // Trocar capa
  btnUp.addEventListener('click', () => input.click());

  input.addEventListener('change', () => {
    const f = input.files && input.files[0];
    if (!f) return;

    // Limite opcional (1.5MB) para evitar estourar o localStorage
    const MAX = 1.5 * 1024 * 1024;
    if (f.size > MAX) {
      alert('Imagem muito grande. Tente uma abaixo de 1.5MB.');
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      try {
        localStorage.setItem(coverKey, dataUrl);
        img.src = dataUrl;
        img.style.display = 'block';
      } catch {
        alert('Não foi possível salvar a capa (limite do navegador).');
      }
      input.value = '';
    };
    reader.readAsDataURL(f);
  });

  // Remover capa
  btnRm.addEventListener('click', () => {
    localStorage.removeItem(coverKey);
    img.removeAttribute('src');
    img.style.display = 'none';
  });
})();
