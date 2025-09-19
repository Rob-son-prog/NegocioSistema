const API = 'http://127.0.0.1:4000';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let page = 0, limit = 20, currentSearch = '';

const els = {
  q: $('#q'),
  btnBuscar: $('#btnBuscar'),
  lista: $('#lista'),
  meta: $('#meta'),
  prev: $('#prev'),
  next: $('#next'),
};

function maskCEP(v) {
  v = (v || '').replace(/\D/g, '').slice(0,8);
  if (v.length > 5) v = v.slice(0,5) + '-' + v.slice(5);
  return v;
}

async function viacep(cep) {
  cep = (cep || '').replace(/\D/g,'');
  if (cep.length !== 8) return null;
  const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
  const j = await r.json();
  if (j.erro) return null;
  return j;
}

function customerCard(c) {
  const root = document.createElement('div');
  root.className = 'panel muted-0';
  root.style.padding = '12px';

  root.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:end">
      <div><label>Nome<input data-name="name" value="${c.name || ''}"></label></div>
      <div><label>CPF<input value="${c.cpf || ''}" disabled></label></div>

      <div><label>E-mail<input data-name="email" type="email" value="${c.email || ''}"></label></div>
      <div><label>Telefone<input data-name="phone" inputmode="tel" value="${c.phone || ''}"></label></div>

      <div><label>CEP<input data-name="cep" value="${maskCEP(c.cep || '')}" maxlength="9" placeholder="00000-000"></label></div>
      <div><label>Número<input data-name="numero" value="${c.numero || ''}"></label></div>

      <div style="grid-column:1/-1"><label>Endereço (Rua/Av.)<input data-name="logradouro" value="${c.logradouro || ''}"></label></div>

      <div><label>Complemento<input data-name="complemento" value="${c.complemento || ''}"></label></div>
      <div><label>Bairro<input data-name="bairro" value="${c.bairro || ''}"></label></div>

      <div><label>Cidade<input data-name="cidade" value="${c.cidade || ''}"></label></div>
      <div><label>UF<input data-name="uf" value="${c.uf || ''}" maxlength="2"></label></div>

      <div style="grid-column:1/-1;display:flex;gap:8px;align-items:center;margin-top:4px">
        <button class="btn primary" data-act="save">Salvar</button>
        <button class="btn danger"  data-act="del">Excluir</button>
        <span class="muted" data-role="msg"></span>
      </div>
    </div>
  `;

  // CEP máscara + ViaCEP por item
  const cepInput = $('[data-name="cep"]', root);
  cepInput.addEventListener('input', () => cepInput.value = maskCEP(cepInput.value));
  cepInput.addEventListener('blur', async () => {
    const d = await viacep(cepInput.value);
    if (!d) return;
    $('[data-name="logradouro"]', root).value = d.logradouro || '';
    $('[data-name="bairro"]', root).value = d.bairro || '';
    $('[data-name="cidade"]', root).value = d.localidade || '';
    $('[data-name="uf"]', root).value = (d.uf || '').toUpperCase();
    $('[data-name="numero"]', root).focus();
  });

  // ações (salvar/excluir)
  root.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const msg = $('[data-role="msg"]', root);

    if (act === 'del') {
      if (!confirm(`Excluir cliente #${c.id} (${c.name})?`)) return;
      btn.disabled = true;
      try {
        const r = await fetch(`${API}/api/customers/${c.id}`, { method: 'DELETE' });
        if (!r.ok) throw new Error('Falha ao excluir');
        root.remove();
      } catch (e) {
        msg.textContent = e.message;
      } finally {
        btn.disabled = false;
      }
      return;
    }

    if (act === 'save') {
      const body = {};
      $$('[data-name]', root).forEach(i => body[i.dataset.name] = (i.value || '').trim() || null);
      if (body.uf) body.uf = body.uf.toUpperCase();
      btn.disabled = true; msg.textContent = 'Salvando...';
      try {
        const r = await fetch(`${API}/api/customers/${c.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!r.ok) throw new Error('Falha ao salvar');
        msg.textContent = 'Salvo!';
        setTimeout(()=> msg.textContent = '', 1500);
      } catch (e) {
        msg.textContent = e.message;
      } finally {
        btn.disabled = false;
      }
    }
  });

  return root;
}

async function load() {
  const params = new URLSearchParams({ limit, offset: page * limit });
  if (currentSearch) params.set('search', currentSearch);
  const r = await fetch(`${API}/api/customers?${params.toString()}`);
  const data = await r.json();
  els.lista.innerHTML = '';
  data.forEach(c => els.lista.appendChild(customerCard(c)));
  els.meta.textContent = data.length ? `Exibindo ${data.length} cliente(s)` : 'Nenhum cliente encontrado';
  els.prev.disabled = page === 0;
  els.next.disabled = data.length < limit;
}

els.btnBuscar.addEventListener('click', () => { currentSearch = els.q.value.trim(); page = 0; load(); });
els.q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { currentSearch = els.q.value.trim(); page = 0; load(); }});
els.prev.addEventListener('click', () => { if (page>0){ page--; load(); }});
els.next.addEventListener('click', () => { page++; load(); });

load();
