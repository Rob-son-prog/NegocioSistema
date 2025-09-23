// ======== PORTAL (API MODE) ========
// Base da API: pega do config.js; no Render usa a MESMA origem (string vazia)
const CFG = window.APP_CONFIG || {};
const API =
  CFG.API_URL ??
  (location.hostname.endsWith('.onrender.com') ? '' : 'http://127.0.0.1:4000');

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
  msg: $('#msg'),
  avatarInitials: $('#avatarInitials'),
  btnVoltar: $('#btnVoltar'),
};

function fdate(iso){ if(!iso) return '—'; const d=new Date(iso+'T00:00:00'); return d.toLocaleDateString('pt-BR',{timeZone:'UTC'}); }
function initials(name){ return (name||'').trim().split(/\s+/).slice(0,2).map(s => (s[0]||'').toUpperCase()).join('') || '?'; }
function getAdminCustomerId(){ const p=new URLSearchParams(location.search); return p.get('id')||p.get('cid')||p.get('oid'); }

// fetch JSON robusto (evita erro quando o servidor devolve HTML em caso de 404/CORS)
async function fetchJSON(url, opts={}){
  const r = await fetch(url, opts);
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = {}; }
  if (!r.ok) throw new Error(data?.error || `Erro HTTP ${r.status}`);
  return data;
}

async function loadData(){
  const adminId = getAdminCustomerId();
  const base = API === '' ? '' : API;

  if (adminId){
    // ROTA ADMIN
    return await fetchJSON(`${base}/api/admin/portal/${adminId}`);
  } else {
    // ROTA CLIENTE (precisa de token)
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token){ location.href = 'acesso-cliente.html'; return null; }
    return await fetchJSON(`${base}/api/client/portal`, {
      headers:{ Authorization:'Bearer '+token }
    });
  }
}

const ALERT_BOX  = document.getElementById('orderAlert');
const ALERT_TEXT = document.getElementById('orderAlertText');

// normaliza status vindo da API (pt/en)
function normStatus(s){
  s = String(s || '').toLowerCase();
  if (s === 'aprovado') return 'approved';
  if (s === 'reprovado' || s === 'recusado') return 'rejected';
  if (s === 'pendente') return 'pending';
  return s;
}

// parcelas excluídas/canceladas (se algum dia tiver soft-delete)
function isRemoved(p){
  const st = String(p?.status || '').toLowerCase();
  return !!(p?.deleted || p?.is_deleted || p?.excluido || p?.deleted_at || st === 'cancelado' || st === 'excluido' || st === 'excluído');
}

// ---- UI instantânea via evento
function showDecisionFlash({status, product, note}) {
  if (!ALERT_BOX || !ALERT_TEXT) return;
  status = normStatus(status);
  const nome = product || 'pedido';
  let cor = '#10b981';
  let txt = note || `Seu pedido "${nome}" foi aprovado.`;
  if (status === 'rejected') {
    cor = '#ef4444'; txt = note || `Seu pedido "${nome}" foi reprovado.`;
  }
  ALERT_TEXT.textContent = txt;
  ALERT_BOX.style.borderLeftColor = cor;
  ALERT_BOX.style.display = '';
}

// “tempo real” entre abas + fallback localStorage
function setupRealtime() {
  try {
    const bc = new BroadcastChannel('orders');
    bc.onmessage = (ev) => {
      const msg = ev?.data;
      if (msg?.type === 'order_decided') {
        showDecisionFlash({ status: msg.status, product: msg.product, note: msg.note });
        loadOrderAlerts();
      }
    };
  } catch {}
  window.addEventListener('storage', (e) => {
    if (e.key === 'order_evt') {
      try {
        const msg = JSON.parse(e.newValue || '{}');
        if (msg?.type === 'order_decided') {
          showDecisionFlash({ status: msg.status, product: msg.product, note: msg.note });
          loadOrderAlerts();
        }
      } catch {}
    }
  });
}

// ---- Alerta baseado nos dados da API
function renderOrderAlert(orders = []) {
  if (!ALERT_BOX || !ALERT_TEXT) return;
  if (!orders.length) { ALERT_BOX.style.display = 'none'; return; }

  const ts = (o) => new Date(
    (o.decided_at || o.updated_at || o.created_at || o.createdAt || Date.now())
      .toString().replace(' ','T')
  ).getTime();
  const last = [...orders].sort((a,b)=> ts(a)-ts(b))[orders.length - 1];

  const status = normStatus(last.status);
  const nome   = last.product || last.produto || 'pedido';

  let cor = '#f59e0b';
  let msg = `Seu pedido "${nome}" está aguardando aprovação.`;
  if (status === 'approved') { cor = '#10b981'; msg = last.decision_note || `Seu pedido "${nome}" foi aprovado.`; }
  if (status === 'rejected') { cor = '#ef4444'; msg = last.decision_note || `Seu pedido "${nome}" foi reprovado.`; }

  ALERT_TEXT.textContent = msg;
  ALERT_BOX.style.borderLeftColor = cor;
  ALERT_BOX.style.display = '';
}

// ---- Polling contínuo (2s enquanto houver pending)
let fastTimer = null;
function setFastPolling(on) {
  if (on && !fastTimer) fastTimer = setInterval(loadOrderAlerts, 2000);
  if (!on && fastTimer) { clearInterval(fastTimer); fastTimer = null; }
}

async function loadOrderAlerts() {
  try {
    const token = localStorage.getItem('client_token');
    if (!token) return;

    const base = API === '' ? '' : API;
    const res = await fetch(`${base}/api/client/orders`, { headers: { Authorization: 'Bearer ' + token } });
    const data = await res.json().catch(() => []);
    if (!res.ok) throw new Error(data?.error || 'Falha ao carregar pedidos');
    renderOrderAlert(data);

    const hasPending = Array.isArray(data) && data.some(o => normStatus(o.status) === 'pending');
    setFastPolling(hasPending);
  } catch (e) {
    console.warn('Avisos:', e.message);
    if (ALERT_BOX) ALERT_BOX.style.display = 'none';
  }
}

function render(data){
  const { customer, contracts = [], installments = [] } = data || {};
  const isAdmin = document.body.dataset.mode === 'admin';

  if (el.clientName) el.clientName.textContent = customer?.name || '—';
  if (el.clienteNome) el.clienteNome.textContent = customer?.name || '—';
  if (el.clientSub)   el.clientSub.textContent   = `${contracts.length||0} contrato(s) • CPF ${customer?.cpf||'—'}`;
  if (el.clienteMeta) el.clienteMeta.textContent = `ID ${customer?.id ?? '—'} • ${contracts.length||0} contrato(s)`;
  if (el.avatarInitials) el.avatarInitials.textContent = initials(customer?.name);

  const novoBtn = document.getElementById('btnNovoPedido');
  if (novoBtn && !isAdmin) {
    const cid = customer?.id ?? '';
    const cpf = customer?.cpf ?? '';
    if (cid) novoBtn.href = `novo-pedido.html?cid=${encodeURIComponent(cid)}&cpf=${encodeURIComponent(cpf)}`;
    try { localStorage.setItem('clienteId', cid); localStorage.setItem('cpf', cpf); } catch {}
  }

  const visiveis = installments.filter(p => !isRemoved(p));
  const totalAberto = visiveis
    .filter(p => String(p.status || '').toLowerCase() !== 'pago')
    .reduce((s,p) => s + Number(p.value ?? p.valor ?? 0), 0);

  const pagas = visiveis.filter(p => String(p.status||'').toLowerCase()==='pago').length;

  if (el.kTotal) el.kTotal.textContent = brl(totalAberto);
  if (el.kPagas) el.kPagas.textContent = String(pagas);
  if (el.kStatus){
    const today=new Date(); today.setHours(0,0,0,0);
    const atrasado = visiveis.some(p=>{
      if (String(p.status||'').toLowerCase()==='pago') return false;
      const d=new Date((p.due||p.venc||'')+'T00:00:00'); return d<today;
    });
    el.kStatus.className='pill '+(pagas===visiveis.length && visiveis.length? 'pago' : (atrasado?'atrasado':'aberto'));
    el.kStatus.textContent = (pagas===visiveis.length && visiveis.length)? 'Pago' : (atrasado?'Atrasado':'Aberto');
  }

  if (!el.parcelas) return;
  el.parcelas.innerHTML = '';
  if (!visiveis.length){ el.parcelas.innerHTML = '<div class="muted">Não há parcelas para exibir.</div>'; return; }

  const sorted = [...visiveis].sort((a,b)=> (a.due<b.due?-1:1));
 // 1) Totais por contrato (para poder exibir 1/3, 2/3, etc.)
const totalsByContract = visiveis.reduce((acc, it) => {
  const cid = it.contract_id;
  acc[cid] = (acc[cid] || 0) + 1;
  return acc;
}, {});

// 2) Contador sequencial por contrato
const seqByContract = {};

sorted.forEach((p, idx) => {
  const value  = Number(p.value ?? p.valor ?? 0);
  const valStr = brl(value);
  const dueISO = (p.due ?? p.venc ?? '').slice(0,10);
  const due    = fdate(dueISO);
  const status = String(p.status || 'Aberto');
  const st     = status.toLowerCase();

  const today = new Date(); today.setHours(0,0,0,0);
  const dv = new Date((p.due || p.venc || '') + 'T00:00:00');
  const chipClass = st === 'pago' ? 'pill pago' : (dv < today ? 'pill atrasado' : 'pill aberto');

  // >>> número sequencial por contrato
  const cid = p.contract_id;
  seqByContract[cid] = (seqByContract[cid] || 0) + 1;
  const num = seqByContract[cid];
  const tot = totalsByContract[cid];     // se quiser mostrar "1/3"

  const actions = `
    <button class="btn sm" data-pix="${p.id}">Gerar PIX</button>
    ${document.body.dataset.mode === 'admin' && st!=='pago' ? `<button class="btn sm primary" data-pay="${p.id}">Baixar</button>` : ''}
    ${document.body.dataset.mode === 'admin' ? `<button class="btn sm danger" data-del="${p.id}" data-info="Parcela #${num}/${tot} • ${valStr} • venc. ${due}">Excluir</button>` : ''}
  `;

  const row = document.createElement('div');
  row.className = 'parcel-row';
  row.innerHTML = `
    <div class="parcel-col left">
      <div class="p-title">Parcela #${num}${tot ? `/${tot}` : ''} — <strong>${valStr}</strong></div>
      <div class="p-meta">Venc.: ${due} · <span class="${chipClass}">${status}</span>${p.paid_at ? ` · pago em ${String(p.paid_at).slice(0,10)}` : ''}</div>
    </div>
    <div class="parcel-col actions">${actions}</div>
  `;
  el.parcelas.appendChild(row);
});


  // >>> Ações (PIX / BAIXAR / EXCLUIR)
  el.parcelas.onclick = async (e)=>{
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;

    const pixId = t.dataset.pix;
    const payId = t.dataset.pay;
    const delId = t.dataset.del;

    const base = API === '' ? '' : API;

    // PIX
    if (pixId) {
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (document.body.dataset.mode !== 'admin') {
          const tk = localStorage.getItem('client_token');
          if (tk) headers.Authorization = 'Bearer ' + tk;
        }
        const r = await fetch(`${base}/api/installments/${pixId}/pix`, { method: 'POST', headers });
        const data = await r.json().catch(()=> ({}));

        if (!r.ok) {
          const msg =
            data?.details?.message ||
            data?.details?.error ||
            data?.error ||
            'Falha ao gerar PIX';
          throw new Error(msg);
        }

        openPixModal({
          installment_id: Number(pixId),
          qr_base64: data.qr_base64,
          qr_code: data.qr_code,
          payment_id: data.payment_id,
        });
      } catch (err) {
        console.error(err);
        alert(err.message || 'Erro ao gerar PIX');
      }
      return;
    }

    // Baixar (admin)
    if (payId){
      if (document.body.dataset.mode !== 'admin') return;
      const ok = confirm('Confirmar baixa desta parcela?');
      if (!ok) return;
      try{
        await fetchJSON(`${base}/api/installments/${payId}/pay`, { method:'POST' });
        const fresh = await loadData();
        render(fresh);
      }catch(err){
        console.error(err);
        alert(err.message || 'Falha ao marcar como pago.');
      }
      return;
    }

    // Excluir (admin)
    if (delId){
      if (document.body.dataset.mode !== 'admin') return;
      const info = t.dataset.info || `Parcela ${delId}`;
      const sure = confirm(`Tem certeza que deseja EXCLUIR?\n\n${info}\n\nEsta ação não pode ser desfeita.`);
      if (!sure) return;

      const pass = prompt('Para confirmar a exclusão, digite a senha:');
      if (pass === null) return;
      if (pass !== '116477'){
        alert('Senha incorreta.');
        return;
      }

      try{
        await fetchJSON(`${base}/api/installments/${delId}`, { method:'DELETE' });
        const fresh = await loadData();
        render(fresh);
      }catch(err){
        console.error(err);
        alert(err.message || 'Falha ao excluir a parcela.');
      }
    }
  };
}

/* ===== helper: rolar até a área do PIX ===== */
function scrollToPixBox() {
  // tenta focar no modal, senão no textarea, senão sobe pro topo
  const target =
    document.getElementById('pixModal') ||
    document.getElementById('pixCode') ||
    document.getElementById('pixQrWrap');

  if (target && typeof target.scrollIntoView === 'function') {
    // compensa cabeçalhos/sticky – 16px de margem
    const y = target.getBoundingClientRect().top + window.pageYOffset - 16;
    window.scrollTo({ top: y, behavior: 'smooth' });
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// ===== Modal PIX (abrir, copiar, fechar e polling) =====
let _pixPoll = null;
function openPixModal({ installment_id, qr_base64, qr_code, payment_id, ticket_url }){
  const modal = $('#pixModal');
  const img   = $('#pixImg');
  const code  = $('#pixCode');
  const copy  = $('#copyPix');
  const close = $('#closePix');
  const status= $('#pixStatus');

  if (!modal) return;

  // conteúdo (com fallback para gerar QR a partir do 'copia e cola')
  if (img) {
    if (qr_base64) {
      img.src = qr_base64;
      img.style.display = 'inline-block';
    } else if (qr_code) {
      img.src = 'https://chart.googleapis.com/chart?chs=240x240&cht=qr&chl=' + encodeURIComponent(qr_code);
      img.style.display = 'inline-block';
    } else {
      img.removeAttribute('src');
      img.style.display = 'none';
      if (ticket_url) window.open(ticket_url, '_blank');
    }
  }
  if (code) code.value = qr_code || '';

  // mostrar
  modal.style.display = 'block';

  // >>> rolar até o topo onde aparece o PIX
  setTimeout(() => {
    scrollToPixBox();
    // evita que o foco faça a página “saltar” de novo
    code?.focus({ preventScroll: true });
  }, 30);

  // copiar
  copy?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(code.value); copy.textContent = 'Copiado!'; setTimeout(()=> copy.textContent = 'Copiar', 1500); }
    catch { alert('Não foi possível copiar.'); }
  }, { once: true });

  // fechar
  const doClose = () => {
    modal.style.display = 'none';
    if (_pixPoll){ clearInterval(_pixPoll); _pixPoll = null; }
  };
  close?.addEventListener('click', doClose, { once: true });

  // polling do status (funciona mesmo sem webhook em dev)
  if (payment_id) {
    const base = API === '' ? '' : API;
    if (_pixPoll) { clearInterval(_pixPoll); _pixPoll = null; }
    _pixPoll = setInterval(async ()=>{
      try{
        const r = await fetch(`${base}/api/pix/${payment_id}`);
        const data = await r.json().catch(()=> ({}));
        if (data?.status === 'approved') {
          if (status) status.textContent = 'Pagamento aprovado ✅';

          // >>> SEM WEBHOOK: baixa a parcela imediatamente
          if (installment_id) {
            try {
              await fetch(`${base}/api/installments/${installment_id}/pay`, { method: 'POST' });
            } catch { /* silencioso */ }
          }

          // recarrega dados para refletir baixa
          const fresh = await loadData();
          render(fresh);
          doClose();
        }
      }catch(e){ /* silencioso */ }
    }, 5000);
  }
}

async function boot(){
  const adminId = getAdminCustomerId();
  document.body.dataset.mode = adminId ? 'admin' : 'client';
  if (el.btnVoltar) el.btnVoltar.style.display = adminId ? '' : 'none';

  try{
    const data = await loadData();
    if (!data) return;
    render(data);

    if (!adminId) {
      await loadOrderAlerts();
      setInterval(loadOrderAlerts, 30000); // segurança
    }
  }catch(e){
    console.error(e);
    if (el.msg) el.msg.textContent = e.message || 'Não foi possível carregar o portal.';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setupRealtime();
  boot();
});

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
      if (avatarImg){ avatarImg.src = url; avatarImg.style.display = 'block'; }
      if (avatarInit) avatarInit.style.display = 'none';
      try{ localStorage.setItem(AVATAR_KEY, url); }catch{}
      setAvatarState(true);
    }else{
      if (avatarImg){ avatarImg.removeAttribute('src'); avatarImg.style.display = 'none'; }
      if (avatarInit) avatarInit.style.display = 'block';
      try{ localStorage.removeItem(AVATAR_KEY); }catch{}
      setAvatarState(false);
    }
  }

  const nameEl = document.getElementById('clientName');
  if (avatarInit) avatarInit.textContent = initials(nameEl?.textContent || '');

  const saved = localStorage.getItem(AVATAR_KEY);
  applyAvatar(saved || null);

  avatarInput?.addEventListener('change', ()=>{
    const f = avatarInput.files?.[0]; if (!f) return;
    if (f.size > 512*1024){ alert('Foto muito grande (máx. 512KB).'); avatarInput.value=''; return; }
    const reader = new FileReader();
    reader.onload = ()=> applyAvatar(reader.result);
    reader.readAsDataURL(f);
  });

  avatarRemove?.addEventListener('click', ()=> applyAvatar(null));
})();
