# The Rack — Identity Canary

The Rack remains a public static reader. Account/Identity integration is an optional enhancement and is disabled by default in `assets/js/account-config.js`.

## Non-negotiable boundaries

- Public comics, page turning, Panel Focus, motion moments, search, and local Continue Reading do not require an account.
- No Identity Gateway HMAC secret is present in this repository or browser JavaScript.
- `rack.json`, comic content, and reader-v3 are outside the canary implementation lane.
- Founder controls change only Rack-specific tiers/groups/resource grants; they do not change a person's global AeroVista role.

## Browser connection points

The canary client is wired to `https://rack-auth.aerovista.us` for:

- sign in / registration
- session / current identity
- Rack Member capability check
- logout
- founder profile directory/detail
- founder tier/group/resource access management
- Rack access audit history

## Activation

Do not enable the flag until rack-auth and the accepted Identity/Account runtime have passed the full live acceptance sequence. Activation is intentionally one line:

```js
window.RACK_ACCOUNT_CONFIG = Object.freeze({
  enabled: true,
  authOrigin: 'https://rack-auth.aerovista.us',
});
```

Rollback is the inverse: set `enabled: false`. The reader remains independent.
