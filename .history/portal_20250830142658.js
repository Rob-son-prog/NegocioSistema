// ======== PORTAL (API MODE) ========
// Admin: portal.html?id=123 (ou ?cid/oid)
// Cliente (CPF): vem de acesso-cliente.html -> portal.html sem query

const API = 'http://127.0.0.1:4000';
const TOKEN_KEY = 'client_token';
const $ = (s) => document.querySelector(s);
const brl = (v) =>
  (Number(v || 0)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const el = {
  clientName: $('#clientName'),
  clientSub: $('#clientSub'),
  clienteNome: $('#clienteNome'),
  clienteMeta: $('#clienteMeta'),
  kTotal: $('#k-total'),
  kPagas: $('#k-pagas'),
  kStatus: $('#k-status'),
  parcelas: $('#parcelas'),
  msg: $('#msg'),
  avatarInitials: $('#avatarInitials'),
  btnVoltar: $('#btnVoltar'),
};

// ---- utils
function fdate(iso) {
  if (!iso) return '—';
  // garante interpretação UTC para não deslocar um dia
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}
function parseDate(iso) {
  if (!iso) return null;
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z');
  return Number.isNaN(d.getTime()) ? null : d;
}
function todayUTC() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function initials(name) {
  return (name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => (s[0] || '').toUpperCase())
    .join('') || '?';
}
function getAdminCustomerId() {
  const p = new URLSearchParams(location.search);
  return p.get('id') || p.get('cid') || p.get('oid');
}

// fetch helper que devolve {ok, status, data}
async function req(url, opts = {}) {
  const res = await fetch(url, opts);
  let data = null;
  try { data = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, data };
}

// ---- carrega dados (admin usa rota admin, cliente usa token)
async function loadData() {
  const adminId = getAdminCustomerId();
  if (adminId) {
    const r = await req(`${API}/api/admin/portal/${adminId}`);
    if (!r.ok) throw new Error(r.data?.error || 'Falha ao carregar portal (admin)');
    return r.data;
  } else {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      location.href = 'acesso-cliente.html';
      return null;
    }
    const r = await req(`${API}/api/client/portal`, {
      headers: { Authorization: 'Bearer ' + token },
    });
    if (r.status === 401 || r.status === 403) {
      localStorage.removeItem(TOKEN_KEY);
      location.href = 'acesso-cliente.html';
      return null;
    }
    if (!r.ok) throw new Error(r.data?.error || 'Falha ao carregar portal');
    return r.data;
  }
}

// ---- renderização
function render(data) {
  const { customer, contracts = [], installments = [] } = data || {};

  // cabeçalho
  const name = customer?.name || '—';
  if (el.clientName) el.clientName.textContent = name;
  if (el.clienteNome) el.clienteNome.textContent = name;

  if (el.clientSub) {
    el.clientSub.textContent = `${contracts.length || 0} contrato(s) • CPF ${customer?.cpf || '—'}`;
  }
  if (el.clienteMeta) {
    el.clienteMeta.textContent = `ID ${customer?.id ?? '—'} • ${contracts.length || 0} contrato(s)`;
  }
  if (el.avatarInitials) el.avatarInitials.textContent = initials(name);

  // KPIs
  const total = installments.reduce((s, p) => s + Number(p.value ?? p.valor ?? 0), 0);
  const pagas = installments.filter((p) => String(p.status || '').toLowerCase() === 'pago').length;

  if (el.kTotal) el.kTotal.textContent = brl(total);
  if (el.kPagas) el.kPagas.textContent = String(pagas);

  if (el.kStatus) {
    const allPaid = installments.length > 0 && pagas === installments.length;
    const t = todayUTC();
    const atrasado = installments.some((p) => {
      if (String(p.status || '').toLowerCase() === 'pago') return false;
      const dv = parseDate(p.due || p.venc);
      return dv && dv < t;
    });

    el.kStatus.className = 'pill';
    if (allPaid) { el.kStatus.classList.add('pago'); el.kStatus.textContent = 'Pago'; }
    else if (atrasado) { el.kStatus.classList.add('atrasado'); el.kStatus.textContent = 'Atrasado'; }
    else { el.kStatus.classList.add('aberto'); el.kStatus.textContent = 'Aberto'; }
  }

  // lista de parcelas
  if (!el.parcelas) return;
  el.parcelas.innerHTML = '';

  if (!installments.length) {
    el.parcelas.innerHTML = '<div class="muted">Não há parcelas para exibir.</div>';
    return;
  }

  // ordenar por vencimento (datas nulas vão para o fim)
  const sorted = [...installments].sort((a, b) => {
    const da = parseDate(a.due || a.venc);
    const db = parseDate(b.due || b.venc);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da - db;
  });

  sorted.forEach((p, idx) => {
    const val = brl(p.value ?? p.valor ?? 0);
    const due = fdate(p.due ?? p.venc);
    const status = String(p.status || 'Aberto');
    const stLower = status.toLowerCase();

    const t = todayUTC();
    let chipClass = 'pill aberto';
    if (stLower === 'pago') chipClass = 'pill pago';
    else {
      const dv = parseDate(p.due || p.venc);
      if (dv && dv < t) chipClass = 'pill atrasado';
    }

    const row = document.createElement('div');
    row.className = 'parcel-row';
    row.innerHTML = `
      <div class="parcel-left">
        <div class="parcel-title">Parcela #${p.id || idx + 1}</div>
        <div class="parcel-sub">Vencimento: ${due}</div>
      </div>
      <div class="parcel-right">
        <div class="parcel-value">${val}</div>
        <span class="${chipClass}">${status.charAt(0).toUpperCase() + status.slice(1)}</span>
        <div class="parcel-actions">
          <button class="btn sm" data-pix="${p.id}">Gerar PIX</button>
          ${stLower !== 'pago' ? `<button class="btn sm primary" data-pay="${p.id}">Baixar</button>` : ''}
        </div>
      </div>
    `;
    el.parcelas.appendChild(row);
  });

  // ações: PIX e pagar (MVP)
  el.parcelas.onclick = async (e) => {
    const payId = e.target?.dataset?.pay;
    const pixId = e.target?.dataset?.pix;
    if (!payId && !pixId) return;

    if (pixId) {
      alert('PIX (exemplo)\n\nAqui entraremos com a integração real de cobrança PIX.');
      return;
    }

    // Baixar (marcar como pago) – MVP
    const confirmPay = confirm('Confirmar baixa desta parcela?');
    if (!confirmPay) return;

    const r = await req(`${API}/api/installments/${payId}/pay`, { method: 'POST' });
    if (!r.ok) {
      alert(r.data?.error || 'Falha ao marcar como pago.');
      return;
    }
    // recarrega os dados após pagar
    try {
      const fresh = await loadData();
      render(fresh);
    } catch (err) {
      console.error(err);
      alert('Pago, mas não consegui atualizar a tela. Recarregue a página.');
    }
  };
}

// ---- boot
async function boot() {
  try {
    const adminId = getAdminCustomerId();
    document.body.dataset.mode = adminId ? 'admin' : 'client';
    if (el.btnVoltar) el.btnVoltar.style.display = adminId ? '' : 'none';

    const data = await loadData();
    if (!data) return;
    render(data);
  } catch (e) {
    console.error(e);
    if (el.msg) el.msg.textContent = e.message || 'Não foi possível carregar o portal.';
  }
}

document.addEventListener('DOMContentLoaded', boot);

// ===== Avatar (localStorage) =====
(function(){
  const params = new URLSearchParams(location.search);
  const idFromUrl  = params.get('cid') || params.get('id') || params.get('oid') || 'sem-id';
  const AVATAR_KEY = `avatar:${idFromUrl}`;

  const avatarLabel  = document.querySelector('.avatar-upload');
  const avatarInput  = document.getElementById('avatarInput');
  const avatarImg    = document.getElementById('avatarImg');
  const avatarInit   = document.getElementById('avatarInitials');
  const avatarRemove = document.getElementById('avatarRemove');

  function setAvatarState(hasPhoto){
    if (avatarLabel) avatarLabel.classList.toggle('no-photo', !hasPhoto);
    if (avatarRemove) avatarRemove.style.display = hasPhoto ? 'inline-flex' : 'none';
  }
  function applyAvatar(url){
    if (url){
      if (avatarImg) { avatarImg.src = url; avatarImg.style.display = 'block'; }
      if (avatarInit) avatarInit.style.display = 'none';
      try { localStorage.setItem(AVATAR_KEY, url); } catch {}
      setAvatarState(true);
    } else {
      if (avatarImg) { avatarImg.removeAttribute('src'); avatarImg.style.display = 'none'; }
      if (avatarInit) avatarInit.style.display = 'block';
      try { localStorage.removeItem(AVATAR_KEY); } catch {}
      setAvatarState(false);
    }
  }

  // iniciais (se não tiver foto)
  const nameEl = document.getElementById('clientName');
  if (avatarInit) avatarInit.textContent = initials(nameEl?.textContent || '');

  const saved = localStorage.getItem(AVATAR_KEY);
  applyAvatar(saved || null);

  avatarInput?.addEventListener('change', ()=>{
    const f = avatarInput.files?.[0]; if (!f) return;
    const MAX = 512 * 1024;
    if (f.size > MAX){ alert('Foto muito grande (máx. 512KB).'); avatarInput.value = ''; return; }
    const reader = new FileReader();
    reader.onload = ()=> applyAvatar(reader.result);
    reader.readAsDataURL(f);
  });

  avatarRemove?.addEventListener('click', ()=> applyAvatar(null));
})();
