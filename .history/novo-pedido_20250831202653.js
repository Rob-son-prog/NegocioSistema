// novo-pedido.js
(function () {
  // lê config e prepara base URL
  const CFG  = window.APP_CONFIG || {};
  const API  = (CFG.API_URL || "").replace(/\/+$/, ""); // tira barra final

  // define TOKEN_KEY se não existir (fallback seguro)
  const TOKEN_KEY = window.TOKEN_KEY || "token";

  const form  = document.getElementById("formPedido");
  const out   = document.getElementById("out");
  const vProd = document.getElementById("produto");
  const vVal  = document.getElementById("valor");

  // exige login
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) { location.href = "acesso-cliente.html"; return; }

  // candidatos de endpoint para criar pedido (tentativa em cascata)
  const POST_CANDIDATES = [
    "/api/orders",
    "/orders",
    "/api/pedidos",
    "/pedidos",
  ];

  async function tryPost(body) {
    const headers = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    };
    let lastErr = null;

    for (const path of POST_CANDIDATES) {
      try {
        const res = await fetch(`${API}${path}`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        let data = null;
        try { data = await res.json(); } catch {}
        if (!res.ok) {
          const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`;
          throw new Error(msg);
        }
        return data || { ok: true, path };
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error("Não foi possível enviar o pedido.");
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    out.style.color = "";
    out.textContent = "";

    const product = (vProd?.value || "").trim();
    // aceita 3500, 3500.00, 3.500,00
    const amount  = Number(String(vVal?.value || "")
                      .replace(/\s/g, "")
                      .replace(/\./g, "")
                      .replace(",", "."));

    if (!product || !isFinite(amount) || amount <= 0) {
      out.textContent = "Informe o produto e um valor válido.";
      return;
    }

    const payload = {
      product,
      amount,
      status: "pendente",    // garante status pendente, caso o backend não defina
    };

    try {
      await tryPost(payload);
      out.style.color = "#065f46";
      out.textContent = "Pedido enviado! Redirecionando para aprovações…";
      vProd.value = "";
      vVal.value  = "";
      setTimeout(() => { location.href = "aprovacoes.html"; }, 700);
    } catch (err) {
      console.error(err);
      out.style.color = "#991b1b";
      out.textContent = "Erro: " + (err?.message || "Falha ao enviar o pedido");
    }
  });
})();
