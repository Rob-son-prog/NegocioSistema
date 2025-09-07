// ======== PORTAL (API MODE) ========
// Admin: portal.html?id=123 (ou ?cid/oid)
// Cliente (CPF): vem de acesso-cliente.html -> portal.html sem query

const API = 'http://127.0.0.1:4000';
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

async function fetchJSON(url, opts={}){ const r=await fetch(url,opts); const data=await r.json().catch(()=>({})); if(!r.ok) throw new Error(data?.error||'Erro de requisição'); return data; }

async function loadData(){
  const adminId = getAdminCustomerId();
  if (adminId){
    return await fetchJSON(`${API}/api/admin/portal/${adminId}`);
  } else {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token){ location.href = 'acesso-cliente.html'; return null; }
    return await fetchJSON(`${API}/api/client/portal`, { headers:{ Authorization:'Bearer '+token } });
  }
}

const ALERT_BOX  = document.getElementById('orderAlert');
const ALERT_TEXT = document.getElementById('orderAlertText');

// ===== Alerta do pedido (aguardando/aprovado/recusado) =====
function renderOrderAlert(orders = []) {
  if (!ALERT_BOX || !ALERT_TEXT) return;
  if (!orders.length) { ALERT_BOX.style.display = 'none'; return; }

  const ts = (o) => new Date(
    (o.decided_at || o.updated_at || o.created_at || o.createdAt || Date.now())
      .toString().replace(' ','T')
  ).getTime();
  const last = [...orders].sort((a,b)=> ts(a)-ts(b))[orders.length - 1];

  const status = String(last.status || '').toLowerCase();
  const nome   = last.product || last.produto || 'pedido';

  let cor = '#f59e0b';
  let msg = `Seu pedido "${nome}" está aguardando aprovação.`;
  if (status === 'approved') { cor = '#10b981'; msg = last.decision_note || `Seu pedido "${nome}" foi aprovado.`; }
  if (status === 'rejected') { cor = '#ef4444'; msg = last.decision_note || `Seu pedido "${nome}" foi reprovado.`; }

  ALERT_TEXT.textContent = msg;
  ALERT_BOX.style.borderLeftColor = cor;
  ALERT_BOX.style.display = '';
}

async function loadOrderAlerts() {
  try {
    const token = localStorage.getItem('client_token');
    if (!token) return;
    const res = await fetch(`${API}/api/client/orders`, { headers: { Authorization: 'Bearer ' + token } });
    const data = await res.json().catch(() => []);
    if (!res.ok) throw new Error(data?.error || 'Falha ao carregar pedidos');
    renderOrderAlert(data);

    // se ainda houver pending, faz polling rápido por 20s
    const hasPending = Array.isArray(data) && data.some(o => String(o.status||'').toLowerCase()==='pending');
    if (hasPending) fastRefetch();
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

  // Link "Fazer novo pedido" com contexto
  const novoBtn = document.getElementById('btnNovoPedido');
  if (novoBtn && !isAdmin) {
    const cid = customer?.id ?? '';
    const cpf = customer?.cpf ?? '';
    if (cid) {
      novoBtn.href = `novo-pedido.html?cid=${encodeURIComponent(cid)}&cpf=${encodeURIComponent(cpf)}`;
    }
    try {
      localStorage.setItem('clienteId', cid);
      localStorage.setItem('cpf', cpf);
    } catch {}
  }

  const total = installments.reduce((s,p)=>s+Number(p.value??p.valor??0),0);
  const pagas = installments.filter(p => String(p.status||'').toLowerCase()==='pago').length;

  if (el.kTotal) el.kTotal.textContent = brl(total);
  if (el.kPagas) el.kPagas.textContent = String(pagas);
  if (el.kStatus){
    const today=new Date(); today.setHours(0,0,0,0);
    const atrasado = installments.some(p=>{
      if (String(p.status||'').toLowerCase()==='pago') return false;
      const d=new Date((p.due||p.venc||'')+'T00:00:00'); return d<today;
    });
    el.kStatus.className='pill '+(pagas===installments.length && installments.length? 'pago' : (atrasado?'atrasado':'aberto'));
    el.kStatus.textContent = (pagas===installments.length && installments.length)? 'Pago' : (atrasado?'Atrasado':'Aberto');
  }

  if (!el.parcelas) return;
  el.parcelas.innerHTML = '';
  if (!installments.length){ el.parcelas.innerHTML = '<div class="muted">Não há parcelas para exibir.</div>'; return; }

  const sorted = [...installments].sort((a,b)=> (a.due<b.due?-1:1));
  sorted.forEach((p, idx)=>{
    const value  = Number(p.value ?? p.valor ?? 0);
    const valStr = brl(value);
    const dueISO = (p.due ?? p.venc ?? '').slice(0,10);
    const due    = fdate(dueISO);
    const status = String(p.status || 'Aberto');
    const st     = status.toLowerCase();

    const today=new Date(); today.setHours(0,0,0,0);
    const dv=new Date((p.due||p.venc||'')+'T00:00:00');
    const chipClass = st==='pago' ? 'pill pago' : (dv<today ? 'pill atrasado' : 'pill aberto');

    const actions = `
      <button class="btn sm" data-pix="${p.id}">Gerar PIX</button>
      ${document.body.dataset.mode === 'admin' && st!=='pago' ? `<button class="btn sm primary" data-pay="${p.id}">Baixar</button>` : ''}
      ${document.body.dataset.mode === 'admin' ? `<button class="btn sm danger" data-del="${p.id}" data-info="Parcela #${p.id} • ${valStr} • venc. ${due}">Excluir</button>` : ''}
    `;

    const row = document.createElement('div');
    row.className = 'parcel-row';
    row.innerHTML = `
      <div class="parcel-col left">
        <div class="p-title">Parcela #${p.id || idx+1} — <strong>${valStr}</strong></div>
        <div class="p-meta">Venc.: ${due} · <span class="${chipClass}">${status}</span>${p.paid_at?` · pago em ${String(p.paid_at).slice(0,10)}`:''}</div>
      </div>
      <div class="parcel-col actions">${actions}</div>
    `;
    el.parcelas.appendChild(row);
  });

  // ações de parcelas
  el.parcelas.onclick = async (e)=>{
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;

    const pixId = t.dataset.pix;
    const payId = t.dataset.pay;
    const delId = t.dataset.del;

    if (pixId){ alert('PIX (exemplo)\n\nA integração real entra aqui.'); return; }

    if (payId){
      if (document.body.dataset.mode !== 'admin') return;
      const ok = confirm('Confirmar baixa desta parcela?');
      if (!ok) return;
      try{
        await fetchJSON(`${API}/api/installments/${payId}/pay`, { method:'POST' });
        const fresh = await loadData();
        render(fresh);
      }catch(err){ alert(err.message || 'Falha ao marcar como pago.'); }
      return;
    }

    if (delId){
      if (document.body.dataset.mode !== 'admin') return;
      const info = t.dataset.info || `Parcela ${delId}`;
      const sure = confirm(`Tem certeza que deseja EXCLUIR?\n\n${info}\n\nEsta ação não pode ser desfeita.`);
      if (!sure) return;

      const pass = prompt('Para confirmar a exclusão, digite a senha:');
      if (pass === null) return;
      if (pass !== '116477'){ alert('Senha incorreta.'); return; }

      try{
        await fetchJSON(`${API}/api/installments/${delId}`, { method:'DELETE' });
        const fresh = await loadData();
        render(fresh);
      }catch(err){ alert(err.message || 'Falha ao excluir a parcela.'); }
    }
  };
}

async function boot(){
  const adminId = getAdminCustomerId();
  document.body.dataset.mode = adminId ? 'admin' : 'client';
  if (el.btnVoltar) el.btnVoltar.style.display = adminId ? '' : 'none';

  try{
    const data = await loadData();
    if (!data) return;
    render(data);

    // cliente logado: carregar avisos e manter atualizando
    if (!adminId) {
      await loadOrderAlerts();
      setInterval(loadOrderAlerts, 30000);
    }
  }catch(e){
    console.error(e);
    if (el.msg) el.msg.textContent = e.message || 'Não foi possível carregar o portal.';
  }
}

// --- “tempo real” entre abas + fallback ---
function setupRealtime() {
  try {
    const bc = new BroadcastChannel('orders');
    bc.onmessage = (ev) => { if (ev?.data?.type === 'order_decided') loadOrderAlerts(); };
  } catch {}

  window.addEventListener('storage', (e) => {
    if (e.key === 'order_evt') {
      try {
        const msg = JSON.parse(e.newValue || '{}');
        if (msg?.type === 'order_decided') loadOrderAlerts();
      } catch {}
    }
  });
}

// polling rápido por 20s quando houver pedido pendente
let fastTimer = null, fastStop = null;
function fastRefetch(){
  clearInterval(fastTimer); clearTimeout(fastStop);
  fastTimer = setInterval(loadOrderAlerts, 2000);
  fastStop  = setTimeout(()=> clearInterval(fastTimer), 20000);
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
