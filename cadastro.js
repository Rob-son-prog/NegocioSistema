// cadastro.js
// Usa mesma origem no Render; em dev usa localhost:4000
const CFG = window.APP_CONFIG || {};
const API = CFG.API_URL ?? (location.hostname.endsWith('.onrender.com') ? '' : 'http://127.0.0.1:4000');

const TOKEN_KEY = 'client_token';

const $ = (s) => document.querySelector(s);
const out = $('#out');
const msgCliente = $('#msgCliente');
const msgContrato = $('#msgContrato');

const fcpf = (v) => (v || '').replace(/\D/g, '').slice(0, 11);
const brl = (v) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const el = {
  // cliente
  nome: $('#c-nome'),
  cpf: $('#c-cpf'),
  email: $('#c-email'),
  fone: $('#c-fone'),

  // endereço
  cep:         $('#c-cep'),
  logradouro:  $('#c-logradouro'),
  numero:      $('#c-numero'),
  complemento: $('#c-complemento'),
  bairro:      $('#c-bairro'),
  cidade:      $('#c-cidade'),
  uf:          $('#c-uf'),

  // contrato
  base: $('#k-base'),
  margem: $('#k-margem'),
  parcelas: $('#k-parcelas'),
  firstdue: $('#k-firstdue'),
  tipo: $('#k-tipo'),

  btnSaveCliente: $('#btnSalvarCliente'),
  btnCriarContrato: $('#btnCriarContrato'),

  btnPortalCliente: $('#btnPortalCliente'),
  btnPortalAdmin: $('#btnPortalAdmin'),
};

let currentCustomer = null; // { id, name, cpf, ... }

// ===== máscara CPF
el.cpf.addEventListener('input', async () => {
  let v = el.cpf.value.replace(/\D/g, '').slice(0, 11);
  v = v.replace(/(\d{3})(\d)/, '$1.$2')
       .replace(/(\d{3})(\d)/, '$1.$2')
       .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  el.cpf.value = v;

  // quando chegar em 11 dígitos, tenta preencher
  if (fcpf(el.cpf.value).length === 11) tryAutoFillByCPF();
});
el.cpf.addEventListener('blur', tryAutoFillByCPF);

// ===== ViaCEP
function limparEndereco() {
  if (!el.logradouro) return;
  el.logradouro.value = '';
  el.bairro.value = '';
  el.cidade.value = '';
  el.uf.value = '';
}
async function buscarCEP() {
  if (!el.cep) return;
  const cep = el.cep.value.replace(/\D/g, '');
  if (cep.length !== 8) { limparEndereco(); return; }
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await r.json();
    if (data.erro) { limparEndereco(); return; }
    el.logradouro.value = data.logradouro || '';
    el.bairro.value     = data.bairro     || '';
    el.cidade.value     = data.localidade || '';
    el.uf.value         = (data.uf || '').toUpperCase();
    el.numero?.focus();
  } catch { limparEndereco(); }
}
if (el.cep) {
  el.cep.addEventListener('input', () => {
    let v = el.cep.value.replace(/\D/g, '').slice(0, 8);
    if (v.length > 5) v = v.slice(0,5) + '-' + v.slice(5);
    el.cep.value = v;
  });
  el.cep.addEventListener('blur', buscarCEP);
  el.cep.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); buscarCEP(); }
  });
}

// ===== helpers API
async function findByCPF(cpf) {
  const clean = fcpf(cpf);
  if (!clean) return null;
  const r = await fetch(`${API}/api/customers/by-cpf/${clean}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('Falha ao buscar CPF');
  return await r.json();
}

// === NOVO: auto-preencher ao informar CPF de cliente já cadastrado
async function tryAutoFillByCPF() {
  const clean = fcpf(el.cpf.value);
  if (clean.length !== 11) return;
  try {
    const cli = await findByCPF(clean);
    if (!cli) return;

    currentCustomer = cli;

    // preenche dados básicos
    el.nome.value  = cli.name  || '';
    el.email.value = cli.email || '';
    el.fone.value  = cli.phone || cli.telefone || '';

    // preenche endereço (se existir no backend)
    if (el.cep)         el.cep.value         = cli.cep || '';
    if (el.logradouro)  el.logradouro.value  = cli.logradouro || '';
    if (el.numero)      el.numero.value      = cli.numero || '';
    if (el.complemento) el.complemento.value = cli.complemento || '';
    if (el.bairro)      el.bairro.value      = cli.bairro || '';
    if (el.cidade)      el.cidade.value      = cli.cidade || '';
    if (el.uf)          el.uf.value          = cli.uf || '';

    msgCliente.textContent = `Cliente já cadastrado (id ${cli.id}).`;
    afterCustomerSaved();
  } catch (e) {
    // silencioso: só não auto-preenche
    console.warn('auto-fill CPF falhou:', e?.message || e);
  }
}

async function saveCliente(e) {
  e?.preventDefault?.();
  msgCliente.textContent = '';
  out.textContent = '—';

  const name = (el.nome.value || '').trim();
  const cpfNum = fcpf(el.cpf.value);
  const email = (el.email.value || '').trim() || null;
  const phone = (el.fone.value || '').trim() || null;

  const addr = {
    cep:         (el.cep?.value || '').trim() || null,
    logradouro:  (el.logradouro?.value || '').trim() || null,
    numero:      (el.numero?.value || '').trim() || null,
    complemento: (el.complemento?.value || '').trim() || null,
    bairro:      (el.bairro?.value || '').trim() || null,
    cidade:      (el.cidade?.value || '').trim() || null,
    uf:          (el.uf?.value || '').trim() || null,
  };

  if (!name || cpfNum.length !== 11) {
    msgCliente.textContent = 'Informe nome e CPF válido.';
    return;
  }

  // já existe?
  const exists = await findByCPF(cpfNum);
  if (exists) {
    currentCustomer = exists;
    msgCliente.textContent = `Cliente já cadastrado (id ${exists.id}).`;
    afterCustomerSaved();
    return;
  }

  // cria
  el.btnSaveCliente.disabled = true;
  try {
    const r = await fetch(`${API}/api/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, cpf: cpfNum, ...addr }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      msgCliente.textContent = data?.error || 'Falha ao salvar cliente';
      return;
    }
    const cli = await findByCPF(cpfNum);
    currentCustomer = cli;
    msgCliente.textContent = `Cliente salvo (id ${cli.id}).`;
    afterCustomerSaved();
  } catch (e) {
    msgCliente.textContent = e.message || 'Erro de rede';
  } finally {
    el.btnSaveCliente.disabled = false;
  }
}

function afterCustomerSaved() {
  if (currentCustomer?.id) {
    el.btnPortalAdmin.style.display = '';
    el.btnPortalAdmin.onclick = () =>
      window.open(`portal.html?id=${currentCustomer.id}`, '_blank');

    el.btnPortalCliente.style.display = '';
    el.btnPortalCliente.onclick = async () => {
      try {
        const r = await fetch(`${API}/api/client/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cpf: currentCustomer.cpf || fcpf(el.cpf.value) }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) { alert(data?.error || 'Falha no login do cliente'); return; }
        localStorage.setItem(TOKEN_KEY, data.token);
        window.open('portal.html', '_blank');
      } catch { alert('Erro de rede ao logar cliente'); }
    };
  }
}

// cria contrato + parcelas (mantido + fallback por CPF)
async function criarContrato(e) {
  e?.preventDefault?.();
  msgContrato.textContent = '';
  out.textContent = '—';

  if (!currentCustomer?.id) await tryAutoFillByCPF();
  if (!currentCustomer?.id) {
    msgContrato.textContent = 'Salve o cliente primeiro ou informe um CPF já cadastrado.';
    return;
  }

  const base = Number(el.base.value || 0);
  const margin = Number(el.margem.value || 0);
  const parcelas = Number(el.parcelas.value || 0);
  const first_due = el.firstdue.value;
  const tipo = el.tipo.value || 'negocio';

  if (!base || !parcelas || !first_due) {
    msgContrato.textContent = 'Preencha base, parcelas e 1º vencimento.';
    return;
  }

  el.btnCriarContrato.disabled = true;
  try {
    const r = await fetch(`${API}/api/contracts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: currentCustomer.id,
        base, margin, parcelas, first_due, tipo,
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { msgContrato.textContent = data?.error || 'Falha ao criar contrato'; return; }
    out.textContent = `Contrato #${data.contract_id} criado. Total: ${brl(data.total)}.`;
  } catch (e) {
    msgContrato.textContent = e.message || 'Erro de rede';
  } finally {
    el.btnCriarContrato.disabled = false;
  }
}

// binds
$('#formCliente')?.addEventListener('submit', saveCliente);
$('#formContrato')?.addEventListener('submit', criarContrato);
