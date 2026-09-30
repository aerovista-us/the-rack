// The Rack identity canary is live after source + runtime acceptance.
// Disable this flag for immediate public-UI rollback; the reader remains independent.
window.RACK_ACCOUNT_CONFIG = Object.freeze({
  enabled: true,
  authOrigin: 'https://rack-auth.aerovista.us',
});
