// novo-pedido.js
(function () {
  const CFG  = window.APP_CONFIG || {};
  const API  = (CFG.API_URL || "").replace(/\/+$/, "");
  const TOKEN_KEY = "token"; // chave do CLIENTE

  const form  = document.getElementById("formPedido");
  const out   = document.getElementById("out");
  const vProd = document.getElementById("produto");
  const vVal  = document.getElementById("valor");

  // bloqueia acesso se não for CLIENTE logado
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) { location.href = "acesso-cliente.html"; return; }

  async function postPedido(body){
    const res = await fetch(`${API}/api/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(()=> ({}));
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return data;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    out.textContent = "";

    const product = (vProd.value || "").trim();
    // aceita 3.500,00 / 3500 / 3500.00
    const amount = Number(String(vVal.value || "")
                        .replace(/\s/g,"").replace(/\./g,"").replace(",","."));

    if (!product || !isFinite(amount) || amount <= 0) {
      out.textContent = "Informe o produto e um valor válido.";
      return;
    }

    try {
      await postPedido({ product, amount });
      out.style.color = "#065f46";
      out.textContent = "Pedido enviado! Redirecionando…";
      setTimeout(()=> location.href = "aprovacoes.html", 600);
    } catch (err) {
      out.style.color = "#991b1b";
      out.textContent = err.message || "Falha ao enviar";
      console.error(err);
    }
  });
})();
