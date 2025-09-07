// novo-pedido.js
const API = 'http://127.0.0.1:4000';
const TOKEN_KEY = 'client_token';

const $ = (s) => document.querySelector(s);
const out = $('#out');

function toNumberBR(v){
  if (!v) return null;
  // converte "3.500,00" -> 3500.00
  return Number(String(v).replace(/\./g,'').replace(',', '.')) || null;
}

async function fetchJSON(url, opts = {}){
  const r = await fetch(url, opts);
  const data = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(data?.error || 'Falha de requisição');
  return data;
}

document.addEventListener('DOMContentLoaded', ()=>{
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token){
    // sem sessão de cliente
    location.href = 'acesso-cliente.html';
    return;
  }

  const form = $('#formPedido');
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    out.textContent = '';

    const produto = $('#produto').value.trim();
    const valor   = toNumberBR($('#valor').value.trim());

    if (!produto){ out.textContent = 'Informe o nome do produto.'; return; }

    try{
      await fetchJSON(`${API}/api/requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ product: produto, estimate: valor })
      });

      out.textContent = 'Pedido enviado com sucesso!';
      // volta ao portal após pequeno delay
      setTimeout(()=> location.href = 'portal.html', 800);
    }catch(err){
      out.textContent = err.message || 'Não foi possível enviar o pedido.';
      console.error(err);
    }
  });
});
