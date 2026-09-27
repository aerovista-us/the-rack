// The Rack identity canary is intentionally disabled by default.
// Enabling it is a one-line promotion after rack-auth + Identity acceptance.
window.RACK_ACCOUNT_CONFIG = Object.freeze({
  enabled: false,
  authOrigin: 'https://rack-auth.aerovista.us',
});
