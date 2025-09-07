// ======== PORTAL (API MODE) ========
// Admin: portal.html?id=123 (ou ?cid/oid)
// Cliente (CPF): vem de acesso-cliente.html -> portal.html sem query


// ======= PORTAL (API MODE) =======
const API = 'http://127.0.0.1:4000';   // use 127.0.0.1 aqui
const TOKEN_KEY = 'client_token';
const $  = (s) => document.querySelector(s);
const brl = (v) => (Number(v || 0)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const el = {
  clientName: $('#clientName'),
  clientSub: $('#clientSub'),
  clienteNome: $('#clienteNome'),
  clienteMeta: $('#clienteMeta'),
  kTotal: $('#k-total'),
  kPagas: $('#k-pagas'),
  kStatus: $('#k-status'),
  parcelas: $('#parcelas'),
  msg: $('#msg')
};

function getAdminCustomerId() {
  const p = new URLSearchParams(location.search);
  return p.get('id') || p.get('cid') || p.get('oid');
}

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Erro de requisição');
  return data;
}

async function loadData() {
  const adminId = getAdminCustomerId();
  if (adminId) {
    // ADMIN -> rota admin
    return await fetchJSON(`${API}/api/admin/portal/${adminId}`);
  } else {
    // CLIENTE -> rota cliente (precisa token salvo)
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      location.href = 'acesso-cliente.html';
      return null;
    }
    return await fetchJSON(`${API}/api/client/portal`, {
      headers: { Authorization: 'Bearer ' + token }
    });
  }
}

function render(data) {
  const { customer, contracts = [], installments = [] } = data || {};

  // Cabeçalhos
  if (el.clientName) el.clientName.textContent = customer?.name || '—';
  if (el.clienteNome) el.clienteNome.textContent = customer?.name || '—';

  if (el.clientSub) {
    el.clientSub.textContent = `${contracts.length || 0} contrato(s) • CPF ${customer?.cpf || '—'}`;
  }
  if (el.clienteMeta) {
    el.clienteMeta.textContent = `ID ${customer?.id ?? '—'} • ${contracts.length || 0} contrato(s)`;
  }

  // Totais
  const total = installments.reduce((s, p) => s + Number(p.value ?? p.valor ?? 0), 0);
  const pagas = installments.filter(p => {
    const st = String(p.status || '').toLowerCase();
    return st === 'pago' || st === 'paid';
  }).length;

  if (el.kTotal) el.kTotal.textContent = brl(total);
  if (el.kPagas) el.kPagas.textContent = String(pagas);
  if (el.kStatus) {
    const allPaid = installments.length > 0 && pagas === installments.length;
    el.kStatus.textContent = allPaid ? 'Pago' : 'Aberto';
    el.kStatus.className = 'pill ' + (allPaid ? 'pago' : 'aberto');
  }

  // Lista de parcelas
  if (el.parcelas) {
    el.parcelas.innerHTML = '';
    installments.forEach((p, i) => {
      const value = brl(p.value ?? p.valor ?? 0);
      const due   = (p.due ?? p.venc ?? '').slice(0, 10);
      const status = String(p.status || 'Aberto');
      const row = document.createElement('div');
      row.className = 'parcel-row';
      row.innerHTML = `
        <div class="parcel-col left">
          <div class="p-title">Parcela ${i + 1} — <strong>${value}</strong></div>
          <div class="p-meta">
            Venc.: ${due} ·
            <span class="pill ${status.toLowerCase()}">${status}</span>
            ${p.paid_at ? `· pago em ${String(p.paid_at).slice(0,10)}` : ''}
          </div>
        </div>
        <div class="parcel-col actions">
          <button class="btn sm" data-pix="${i + 1}">Gerar PIX</button>
          ${status.toLowerCase() !== 'pago' ? `<button class="btn sm primary" data-pay="${i + 1}">Baixar</button>` : ''}
        </div>
      `;
      el.parcelas.appendChild(row);
    });

    // ações demo (PIX/baixar) – substitua quando integrar
    el.parcelas.onclick = (e) => {
      const n = e.target.dataset.pay || e.target.dataset.pix;
      if (!n) return;
      if (e.target.dataset.pix) {
        alert('PIX (exemplo)\n\nGeração real será integrada aqui.');
      } else {
        alert('Baixar (exemplo)\n\nMarcar como pago será tratado na API.');
      }
    };
  }
}

async function boot() {
  try {
    const data = await loadData();
    if (!data) return; // redirecionou p/ login
    render(data);
  } catch (e) {
    console.error(e);
    if (el.msg) el.msg.textContent = e.message || 'Não foi possível carregar o portal.';
  }
}

document.addEventListener('DOMContentLoaded', boot);

// ===== Avatar redondo (mantido do seu arquivo atual) =====
(function(){
  const params = new URLSearchParams(location.search);
  const idFromUrl  = params.get('cid') || params.get('id') || params.get('oid') || 'sem-id';
  const AVATAR_KEY = `avatar:${idFromUrl}`;

  const avatarLabel  = document.querySelector('.avatar-upload');
  const avatarInput  = document.getElementById('avatarInput');
  const avatarImg    = document.getElementById('avatarImg');
  const avatarInit   = document.getElementById('avatarInitials');
  const avatarRemove = document.getElementById('avatarRemove');

  const clientNameEl = document.getElementById('clientName');
  const clientSubEl  = document.getElementById('clientSub');

  function initials(name){
    return (name||'').trim().split(/\s+/).slice(0,2).map(s => s[0]?.toUpperCase() || '').join('') || '?';
  }
  if (avatarInit) avatarInit.textContent = initials(clientNameEl?.textContent || '');

  function setAvatarState(hasPhoto){
    if (avatarLabel) avatarLabel.classList.toggle('no-photo', !hasPhoto);
    if (avatarRemove) avatarRemove.style.display = hasPhoto ? 'inline-flex' : 'none';
  }

  function applyAvatar(url){
    if (url){
      if (avatarImg) {
        avatarImg.src = url;
        avatarImg.style.display = 'block';
      }
      if (avatarInit) avatarInit.style.display = 'none';
      try { localStorage.setItem(AVATAR_KEY, url); } catch {}
      setAvatarState(true);
    } else {
      if (avatarImg) {
        avatarImg.removeAttribute('src');
        avatarImg.style.display = 'none';
      }
      if (avatarInit) avatarInit.style.display = 'block';
      try { localStorage.removeItem(AVATAR_KEY); } catch {}
      setAvatarState(false);
    }
  }

  const saved = localStorage.getItem(AVATAR_KEY);
  applyAvatar(saved || null);

  avatarInput?.addEventListener('change', ()=>{
    const f = avatarInput.files?.[0]; if (!f) return;
    const MAX = 512 * 1024;
    if (f.size > MAX){
      alert('Foto muito grande (máx. 512KB).');
      avatarInput.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = ()=> applyAvatar(reader.result);
    reader.readAsDataURL(f);
  });

  avatarRemove?.addEventListener('click', ()=> applyAvatar(null));
})();
