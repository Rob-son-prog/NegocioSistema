// config.js
window.APP_CONFIG = {
  API_URL: "http://localhost:4000",       // URL da sua API (ajuste se for outra porta/host)
  AUTH_TOKEN: localStorage.getItem("token") // se você autentica com Bearer token
};
