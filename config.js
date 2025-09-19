// config.js
(function () {
  // Se estiver no Render, usa o mesmo domínio (https://seusite.onrender.com)
  const IS_RENDER = /\.onrender\.com$/i.test(location.hostname);
  const API_URL   = IS_RENDER ? location.origin : 'http://127.0.0.1:4000';

  // Para o portal do cliente usamos o token "client_token".
  // (No admin, mude TOKEN_KEY para "admin_token" se precisar)
  const TOKEN_KEY = 'client_token';

  window.APP_CONFIG = {
    API_URL,
    TOKEN_KEY,
    get AUTH_TOKEN() {
      return localStorage.getItem(TOKEN_KEY) || '';
    }
  };
})();
