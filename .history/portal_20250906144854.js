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

function renderOrderAlert(orders = []) {
  if (!ALERT_BOX || !ALERT_TEXT) return;
  const decided = orders.filter(o => o.status !== 'pending');
  if (!decided.length) { ALERT_BOX.style.display = 'none'; return; }
  decided.sort((a,b) => (a.decided_at || '').localeCompare(b.decided_at || ''));
  const last = decided[decided.length - 1];
  const statusLabel = last.status === 'approved' ? 'aprovado' : 'reprovado';
  const msg = last.decision_note || `Seu pedido "${last.product}" foi ${statusLabel}.`;
  ALERT_TEXT.textContent = msg;
  ALERT_BOX.style.borderLeftColor = (last.status === 'approved') ? '#10b981' : '#ef4444';
  ALERT_BOX.style.display = '';
}

async function loadOrderAlerts() {
  try {
    const token = localStorage.getItem('client_token');
    if (!token) return; // admin não tem token de cliente
    const res = await fetch(`${API}/api/client/orders`, { headers: { Authorization: 'Bearer ' + token } });
    const data = await res.json().catch(() => []);
    if (!res.ok) throw new Error(data?.error || 'Falha ao carregar pedidos');
    renderOrderAlert(data);
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

  // >>> Novo: preparar link "Fazer novo pedido" passando contexto do cliente
  const novoBtn = document.getElementById('btnNovoPedido');
  if (novoBtn && !isAdmin) {
    const cid = customer?.id ?? '';
    const cpf = customer?.cpf ?? '';
    if (cid) {
      novoBtn.href = `novo-pedido.html?cid=${encodeURIComponent(cid)}&cpf=${encodeURIComponent(cpf)}`;
    }
    // fallback para a página do novo pedido
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

    const isAdminLocal = isAdmin;
    const actions = `
      <button class="btn sm" data-pix="${p.id}">Gerar PIX</button>
      ${isAdminLocal && st!=='pago' ? `<button class="btn sm primary" data-pay="${p.id}">Baixar</button>` : ''}
      ${isAdminLocal ? `<button class="btn sm danger" data-del="${p.id}" data-info="Parcela #${p.id} • ${valStr} • venc. ${due}">Excluir</button>` : ''}
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

  // ações PIX / Baixar / Excluir
  el.parcelas.onclick = async (e)=>{
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;

    const pixId = t.dataset.pix;
    const payId = t.dataset.pay;
    const delId = t.dataset.del;

    if (pixId){
      alert('PIX (exemplo)\n\nA integração real entra aqui.');
      return;
    }

    if (payId){
      if (document.body.dataset.mode !== 'admin') return;
      const ok = confirm('Confirmar baixa desta parcela?');
      if (!ok) return;
      try{
        await fetchJSON(`${API}/api/installments/${payId}/pay`, { method:'POST' });
        const fresh = await loadData();
        render(fresh);
      }catch(err){
        console.error(err);
        alert(err.message || 'Falha ao marcar como pago.');
      }
      return;
    }

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
        await fetchJSON(`${API}/api/installments/${delId}`, { method:'DELETE' });
        const fresh = await loadData();
        render(fresh);
      }catch(err){
        console.error(err);
        alert(err.message || 'Falha ao excluir a parcela.');
      }
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

    // cliente logado: carregar avisos
    if (!adminId) {
      await loadOrderAlerts();
      setInterval(loadOrderAlerts, 30000);
    }
  }catch(e){
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

// ... (deixe o início do seu arquivo como está)

function renderOrderAlert(orders = []) {
  if (!ALERT_BOX || !ALERT_TEXT) return;

  if (!orders.length) { ALERT_BOX.style.display = 'none'; return; }

  // pega o mais recente por created_at/updated_at/decided_at
  const normDate = (o) => new Date(
    (o.decided_at || o.updated_at || o.created_at || o.createdAt || Date.now())
      .toString().replace(' ','T')
  ).getTime();

  const last = [...orders].sort((a,b)=> normDate(a) - normDate(b))[orders.length - 1];

  const status = String(last.status || '').toLowerCase(); // pending | approved | rejected
  const nomeProd = last.product || last.produto || 'pedido';

  let cor = '#f59e0b'; // amber (pending)
  let msg = `Seu pedido "${nomeProd}" está aguardando aprovação.`;

  if (status === 'approved') { cor = '#10b981'; msg = last.decision_note || `Seu pedido "${nomeProd}" foi aprovado.`; }
  if (status === 'rejected') { cor = '#ef4444'; msg = last.decision_note || `Seu pedido "${nomeProd}" foi reprovado.`; }

  ALERT_TEXT.textContent = msg;
  ALERT_BOX.style.borderLeftColor = cor;
  ALERT_BOX.style.display = '';
}

// ... (restante do arquivo igual)
// em loadOrderAlerts() já está chamando /api/client/orders e atualiza o alerta
