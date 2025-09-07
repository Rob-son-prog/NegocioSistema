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
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
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
// ... (código anterior igual)

function render(data) {
  const { customer, contracts = [], installments = [] } = data || {};
  // (as partes de cabeçalho/total/status permanecem iguais)

  // --- render parcelas (com ações extra se admin) ---
  const params = new URLSearchParams(location.search);
  const isAdmin = ['id','cid','oid'].some(k => params.get(k));

  if (el.parcelas) {
    el.parcelas.innerHTML = '';
    installments.forEach((p, i) => {
      const value  = brl(p.value ?? p.valor ?? 0);
      const due    = (p.due ?? p.venc ?? '').slice(0,10);
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
          <button class="btn sm" data-pix="${p.id}">Gerar PIX</button>
          ${status.toLowerCase() !== 'pago' ? `<button class="btn sm primary" data-pay="${p.id}">Baixar</button>` : ''}
          ${isAdmin ? `
            <button class="btn sm" data-edit="${p.id}">Editar</button>
            <button class="btn sm danger" data-del="${p.id}">Excluir</button>
          ` : ''}
        </div>
      `;
      el.parcelas.appendChild(row);
    });

    el.parcelas.onclick = async (e) => {
      const id   = e.target.dataset.pay || e.target.dataset.pix || e.target.dataset.edit || e.target.dataset.del;
      if (!id) return;

      // PIX/baixar seguem como antes (exemplo)
      if (e.target.dataset.pix) {
        return alert('PIX (exemplo)\n\nIntegração real entra aqui.');
      }
      if (e.target.dataset.pay) {
        try {
          await fetchJSON(`${API}/api/installments/${id}/pay`, { method: 'POST' });
          location.reload();
        } catch (err) {
          alert(err.message);
        }
        return;
      }

      // ADMIN: editar parcela
      if (e.target.dataset.edit) {
        const novoValor = prompt('Novo valor (R$):');
        const novoVenc  = prompt('Novo vencimento (YYYY-MM-DD):');
        const novoStatus= prompt('Status (Aberto/Pago/Atrasado):');
        try {
          await fetchJSON(`${API}/api/installments/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              value: novoValor ? Number(String(novoValor).replace(',', '.')) : undefined,
              due:   novoVenc || undefined,
              status: novoStatus || undefined
            })
          });
          location.reload();
        } catch (err) {
          alert(err.message);
        }
        return;
      }

      // ADMIN: excluir parcela
      if (e.target.dataset.del) {
        if (!confirm('Excluir esta parcela?')) return;
        try {
          await fetchJSON(`${API}/api/installments/${id}`, { method: 'DELETE' });
          location.reload();
        } catch (err) {
          alert(err.message);
        }
      }
    };
  }
}

// ... (restante do arquivo permanece)

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

// ===== Avatar (localStorage, igual ao seu fluxo) =====
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
