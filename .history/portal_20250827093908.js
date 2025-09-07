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

// ===== Avatar redondo (localStorage por cliente) =====
(function(){
  const params = new URLSearchParams(location.search);
  const idFromUrl  = params.get('cid') || params.get('id') || params.get('oid') || 'sem-id';
  const AVATAR_KEY = `avatar:${idFromUrl}`;

  const avatarLabel  = document.querySelector('.avatar-upload');
  const avatarInput  = document.getElementById('avatarInput');
  const avatarImg    = document.getElementById('avatarImg');
  const avatarInit   = document.getElementById('avatarInitials');
  const avatarRemove = document.getElementById('avatarRemove');

  // Preenche título/sub a partir do conteúdo existente
  const h1Existente = document.querySelector('.content h1');
  const subExistente = h1Existente?.nextElementSibling?.classList.contains('muted')
    ? h1Existente.nextElementSibling
    : document.querySelector('.content .muted');

  const clientNameEl = document.getElementById('clientName');
  const clientSubEl  = document.getElementById('clientSub');

  if (clientNameEl && h1Existente) clientNameEl.textContent = h1Existente.textContent || '';
  if (clientSubEl && subExistente) clientSubEl.textContent = subExistente.textContent || '';

  function initials(name){
    return (name||'').trim().split(/\s+/).slice(0,2).map(s => s[0]?.toUpperCase() || '').join('') || '?';
  }
  avatarInit.textContent = initials(clientNameEl?.textContent || '');

  function setAvatarState(hasPhoto){
    if (avatarLabel){
      avatarLabel.classList.toggle('no-photo', !hasPhoto);
    }
    if (avatarRemove){
      avatarRemove.style.display = hasPhoto ? 'inline-flex' : 'none';
    }
  }

  function applyAvatar(url){
    if (url){
      avatarImg.src = url;
      avatarImg.style.display = 'block';
      avatarInit.style.display = 'none';
      try { localStorage.setItem(AVATAR_KEY, url); } catch {}
      setAvatarState(true);
    } else {
      avatarImg.removeAttribute('src');
      avatarImg.style.display = 'none';
      avatarInit.style.display = 'block';
      try { localStorage.removeItem(AVATAR_KEY); } catch {}
      setAvatarState(false);
    }
  }

  // Estado inicial (carrega salvo, se houver)
  const saved = localStorage.getItem(AVATAR_KEY);
  applyAvatar(saved || null);

  // Seleção de arquivo (adiciona/substitui no mesmo botão)
  avatarInput?.addEventListener('change', ()=>{
    const f = avatarInput.files?.[0]; if (!f) return;
    const MAX = 512 * 1024; // 512KB
    if (f.size > MAX){
      alert('Foto muito grande (máx. 512KB).');
      avatarInput.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = ()=> applyAvatar(reader.result);
    reader.readAsDataURL(f);
  });

  // Remover
  avatarRemove?.addEventListener('click', ()=> applyAvatar(null));
})();