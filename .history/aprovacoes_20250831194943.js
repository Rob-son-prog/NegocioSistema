// aprovacoes.js
(function () {
  const CFG = window.APP_CONFIG || {};
  const API = (CFG.API_URL || "").replace(/\/+$/, ""); // sem barra final
  const $ = s => document.querySelector(s);
  const listEl = $("#orders");

  // rotas candidatas para listar pedidos
  const LIST_CANDIDATES = [
    "/api/orders/pending",  // 1) lista já pendentes
    "/orders/pending",      // 2)
    "/api/pedidos/pendentes",
    "/pedidos/pendentes",
    "/api/orders",          // 3) lista tudo
    "/orders",
    "/api/pedidos",
    "/pedidos"
  ];

  // helpers
  async function fetchJSON(url, opts = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(CFG.AUTH_TOKEN ? { Authorization: `Bearer ${CFG.AUTH_TOKEN}` } : {})
    };
    const res = await fetch(url, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) {
      const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  function normalizeStatus(s) {
    if (!s) return "pendente";
    s = String(s).toLowerCase();
    if (s.includes("pend")) return "pendente";
    if (s.includes("apro")) return "aprovado";
    if (s.includes("rej") || s.includes("recus") || s.includes("neg")) return "recusado";
    if (s.includes("abert")) return "pendente";
    return s; // fallback
  }

  function normalizeOrder(o) {
    return {
      id: o.id ?? o.order_id ?? o.codigo ?? o.uuid ?? "",
      customer_name: o.customer_name ?? o.cliente ?? o.nome ?? "Cliente",
      cpf: o.cpf ?? o.documento ?? "",
      product: o.product ?? o.produto ?? o.nome_produto ?? "",
      amount: Number(o.amount ?? o.valor ?? o.total ?? 0),
      status: normalizeStatus(o.status ?? o.situacao ?? "pendente"),
      created_at: o.created_at ?? o.data ?? o.createdAt ?? null
    };
  }

  function card(o){
    const v = Number(o.amount || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const dt = o.created_at ? new Date(String(o.created_at).replace(" ", "T")) : null;
    const when = dt ? dt.toLocaleString("pt-BR") : "—";
    return `
      <div class="order-card">
        <div class="order-left">
          <span class="order-name">${o.customer_name}</span>
          <span class="badge negocio">Pedido</span>
          <span class="order-meta">${when}</span>
          <div class="muted">CPF ${o.cpf || "—"} · Produto: ${o.product || "—"}</div>
        </div>
        <div class="order-valor">${v}</div>
        <div class="order-actions">
          <button class="btn sm primary" data-approve="${o.id}">Aprovar</button>
          <button class="btn sm danger" data-reject="${o.id}">Recusar</button>
        </div>
      </div>
    `;
  }

  async function tryList() {
    // tenta em cascata as rotas; com query anti-cache
    const t = Date.now();
    let lastErr = null;
    for (const path of LIST_CANDIDATES) {
      try {
        const data = await fetchJSON(`${API}${path}?t=${t}`);
        // data pode ser lista já pendente ou geral
        const arr = Array.isArray(data) ? data : (data.items || data.results || []);
        if (arr && arr.length >= 0) {
          return { pathTried: path, list: arr.map(normalizeOrder) };
        }
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error("Não foi possível listar pedidos.");
  }

  function render(list) {
    const pendentes = list.filter(o => normalizeStatus(o.status) === "pendente");
    if (!pendentes.length) {
      listEl.classList.add("empty");
      listEl.innerHTML = `<div class="muted">Sem pedidos pendentes.</div>`;
      return;
    }
    listEl.classList.remove("empty");
    listEl.innerHTML = pendentes.map(card).join("");
  }

  async function load() {
    try {
      const { list } = await tryList();
      render(list);
    } catch (err) {
      listEl.classList.remove("empty");
      listEl.innerHTML = `<div class="error">Falha ao carregar: ${err.message}</div>`;
      console.error(err);
    }
  }

  // Aprovar/Recusar com múltiplos caminhos aceitos
  async function postAction(id, action) {
    const ACTIONS = [
      `/api/orders/${id}/${action}`,
      `/orders/${id}/${action}`,
      `/api/pedidos/${id}/${action}`,
      `/pedidos/${id}/${action}`,
      // pt-br variações:
      action === "approve" ? `/api/pedidos/${id}/aprovar` : `/api/pedidos/${id}/recusar`,
      action === "approve" ? `/pedidos/${id}/aprovar` : `/pedidos/${id}/recusar`,
    ];
    let lastErr = null;
    for (const p of ACTIONS) {
      try {
        await fetchJSON(`${API}${p}`, { method: "POST" });
        return;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error("Ação não concluída.");
  }

  document.addEventListener("click", async (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const idA = t.dataset.approve;
    const idR = t.dataset.reject;

    if (idA) {
      try { await postAction(idA, "approve"); await load(); }
      catch (err) { alert("Erro ao aprovar: " + err.message); }
    }
    if (idR) {
      try { await postAction(idR, "reject"); await load(); }
      catch (err) { alert("Erro ao recusar: " + err.message); }
    }
  });

  document.addEventListener("DOMContentLoaded", () => {
    load();
    // atualiza a cada 5s para refletir novas solicitações
    setInterval(load, 5000);
  });
})();
