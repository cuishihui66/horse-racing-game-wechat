(function bootstrapConfig() {
  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const hostname = window.location.hostname || 'localhost';

  window.APP_CONFIG = Object.assign(
    {
      API_BASE_URL: `${protocol}//${hostname}:3001`,
      WS_BASE_URL: `${wsProtocol}//${hostname}:3001`,
      DEV_AUTH_MODE: true,
    },
    window.APP_CONFIG || {},
  );
})();
