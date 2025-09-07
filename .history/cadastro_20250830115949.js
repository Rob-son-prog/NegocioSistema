// cadastro.js
const API = 'http://127.0.0.1:4000';
const TOKEN_KEY = 'client_token';

const $ = (s) => document.querySelector(s);
const out = $('#out');
const msgCliente = $('#msgCliente');
const msgContrato = $('#msgContrato');

const fcpf = (v) => (v || '').replace(/\D/g, '').slice(0, 11);
const brl = (v) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const el = {
  nome: $('#c-nome'),
  cpf: $('#c-cpf'),
  email: $('#c-email'),
  fone: $('#c-fone'),

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

// máscara simples de CPF no input
el.cpf.addEventListener('input', () => {
  let v = el.cpf.value.replace(/\D/g, '').slice(0, 11);
  v = v.replace(/(\d{3})(\d)/, '$1.$2')
       .replace(/(\d{3})(\d)/, '$1.$2')
       .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  el.cpf.value = v;
});

// checa duplicidade de CPF
async function findByCPF(cpf) {
  const clean = fcpf(cpf);
  if (!clean) return null;
  const r = await fetch(`${API}/api/customers/by-cpf/${clean}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('Falha ao buscar CPF');
  return await r.json();
}

async function saveCliente(e) {
  e?.preventDefault?.();
  msgCliente.textContent = '';
  out.textContent = '—';

  const name = (el.nome.value || '').trim();
  const cpfNum = fcpf(el.cpf.value);
  const email = (el.email.value || '').trim() || null;
  const phone = (el.fone.value || '').trim() || null;

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
      body: JSON.stringify({ name, email, phone, cpf: cpfNum }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      msgCliente.textContent = data?.error || 'Falha ao salvar cliente';
      return;
    }
    // buscar cliente por cpf para ter o id
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
  // habilita botões de portal
  if (currentCustomer?.id) {
    el.btnPortalAdmin.style.display = '';
    el.btnPortalAdmin.onclick = () =>
      window.open(`portal.html?id=${currentCustomer.id}`, '_blank');

    el.btnPortalCliente.style.display = '';
    el.btnPortalCliente.onclick = async () => {
      // faz login por CPF para obter token e abre o portal do cliente
      try {
        const r = await fetch(`${API}/api/client/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cpf: currentCustomer.cpf || fcpf(el.cpf.value) }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          alert(data?.error || 'Falha no login do cliente');
          return;
        }
        localStorage.setItem(TOKEN_KEY, data.token);
        window.open('portal.html', '_blank');
      } catch (e) {
        alert('Erro de rede ao logar cliente');
      }
    };
  }
}

// cria contrato + parcelas
async function criarContrato(e) {
  e?.preventDefault?.();
  msgContrato.textContent = '';
  out.textContent = '—';

  if (!currentCustomer?.id) {
    msgContrato.textContent = 'Salve o cliente primeiro.';
    return;
  }

  const base = Number(el.base.value || 0);
  const margin = Number(el.margem.value || 0);
  const parcelas = Number(el.parcelas.value || 0);
  const first_due = el.firstdue.value; // YYYY-MM-DD
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
        base,
        margin,
        parcelas,
        first_due,
        tipo,
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      msgContrato.textContent = data?.error || 'Falha ao criar contrato';
      return;
    }
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
