// config.js
(function () {
  // Em produção (Render) usa o próprio domínio; em dev usa localhost:4000
  const IS_RENDER = /\.onrender\.com$/i.test(location.hostname);
  const API_URL   = IS_RENDER ? location.origin : 'http://127.0.0.1:4000';

  // Para o ADMIN:
  const TOKEN_KEY = 'admin_token';

  window.APP_CONFIG = {
    API_URL,
    TOKEN_KEY,
    get AUTH_TOKEN() {
      return localStorage.getItem(TOKEN_KEY) || '';
    }
  };
})();
