(() => {
  const config = window.RACK_ACCOUNT_CONFIG || {};
  const accountButton = document.getElementById('rackAccountButton');
  if (!accountButton || !config.enabled || !config.authOrigin) return;

  const authOrigin = String(config.authOrigin).replace(/\/$/, '');
  let session = { authenticated: false, csrfToken: null };
  let founderData = null;

  accountButton.hidden = false;

  const h = (tag, attrs = {}, text = '') => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'class') node.className = value;
      else if (key === 'type') node.type = value;
      else node.setAttribute(key, value);
    }
    if (text) node.textContent = text;
    return node;
  };

  function currentNext() {
    return `${location.pathname}${location.search}${location.hash}` || '/';
  }

  function signIn(register = false) {
    const path = register ? '/register' : '/login';
    location.assign(`${authOrigin}${path}?next=${encodeURIComponent(currentNext())}`);
  }

  async function api(path, options = {}) {
    const init = {
      credentials: 'include',
      headers: { Accept: 'application/json', ...(options.headers || {}) },
      ...options,
    };
    if (init.body !== undefined && typeof init.body !== 'string') {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(init.body);
    }
    if (init.method && init.method !== 'GET' && session.csrfToken) {
      init.headers['X-Rack-CSRF'] = session.csrfToken;
    }
    const response = await fetch(`${authOrigin}${path}`, init);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `Request failed (${response.status})`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  function ensureDialog() {
    let dialog = document.getElementById('rackAccountDialog');
    if (dialog) return dialog;
    dialog = h('dialog', { id: 'rackAccountDialog', class: 'rack-account-dialog', 'aria-labelledby': 'rackAccountTitle' });
    const shell = h('div', { class: 'rack-account-shell' });
    const head = h('div', { class: 'rack-account-head' });
    const heading = h('div');
    heading.append(h('p', { class: 'eyebrow' }, 'THE RACK · AEROVISTA ACCOUNT'));
    heading.append(h('h2', { id: 'rackAccountTitle' }, 'My Rack'));
    heading.append(h('p', { id: 'rackAccountMeta', class: 'rack-account-meta' }, 'Account status'));
    const close = h('button', { class: 'rack-account-close', type: 'button', 'aria-label': 'Close' }, '×');
    close.addEventListener('click', () => dialog.close());
    head.append(heading, close);
    shell.append(head);
    shell.append(h('div', { id: 'rackAccountStatus', class: 'rack-account-status' }, 'Loading…'));
    shell.append(h('div', { id: 'rackAccountActions', class: 'rack-account-actions' }));
    shell.append(h('section', { id: 'rackAdmin', class: 'rack-admin', hidden: '' }));
    dialog.append(shell);
    document.body.append(dialog);
    return dialog;
  }

  function setStatus(message, error = false) {
    const node = document.getElementById('rackAccountStatus');
    if (!node) return;
    node.textContent = message;
    node.dataset.state = error ? 'error' : 'ok';
  }

  function renderSignedOut(dialog) {
    document.getElementById('rackAccountMeta').textContent = 'No account required to read public comics.';
    setStatus('Sign in to use Rack member features. Public reading remains available without an account.');
    const actions = document.getElementById('rackAccountActions');
    actions.replaceChildren();
    const login = h('button', { class: 'primary', type: 'button' }, 'Sign in');
    const register = h('button', { type: 'button' }, 'Create account');
    login.addEventListener('click', () => signIn(false));
    register.addEventListener('click', () => signIn(true));
    actions.append(login, register);
    const admin = document.getElementById('rackAdmin');
    admin.hidden = true;
    admin.replaceChildren();
    dialog.showModal();
  }

  async function renderSignedIn(dialog) {
    const me = await api('/api/me');
    const identity = me.identity || session.identity || {};
    const rack = me.rack || session.rack || {};
    const label = identity.name || identity.email || 'AeroVista member';
    document.getElementById('rackAccountMeta').textContent = `${label} · ${identity.avccRole || 'guest'} · Rack tier: ${rack.founder ? 'Founder' : (rack.tier || 'public')}`;

    try {
      await api('/api/member');
      setStatus('Rack member access is active.');
    } catch (error) {
      if (rack.founder) setStatus('Founder access is active.');
      else if (error.status === 403) setStatus('Signed in. No Rack member tier has been assigned yet.');
      else setStatus('Signed in, but member authorization could not be confirmed.', true);
    }

    const actions = document.getElementById('rackAccountActions');
    actions.replaceChildren();
    const refresh = h('button', { type: 'button' }, 'Refresh access');
    const logout = h('button', { type: 'button', class: 'rack-danger' }, 'Sign out');
    refresh.addEventListener('click', async () => {
      await refreshSession();
      await renderSignedIn(dialog);
    });
    logout.addEventListener('click', async () => {
      try { await api('/api/logout', { method: 'POST' }); } finally {
        session = { authenticated: false, csrfToken: null };
        founderData = null;
        dialog.close();
        updateButton();
      }
    });
    actions.append(refresh, logout);

    const admin = document.getElementById('rackAdmin');
    if (rack.founder || identity.avccRole === 'founder') {
      admin.hidden = false;
      await renderFounderAdmin(admin);
    } else {
      admin.hidden = true;
      admin.replaceChildren();
    }
    dialog.showModal();
  }

  function option(value, label) {
    const node = document.createElement('option');
    node.value = value;
    node.textContent = label;
    return node;
  }

  async function renderFounderAdmin(container) {
    container.replaceChildren(h('h3', {}, 'Founder Access Control'), h('p', { class: 'rack-muted' }, 'Rack tiers and groups only. Global AeroVista roles are never changed here.'));
    const grid = h('div', { class: 'rack-admin-grid' });
    const loading = h('div', { class: 'rack-admin-summary' }, 'Loading profiles and access definitions…');
    grid.append(loading);
    container.append(grid);

    const [profilesResult, tiersResult, groupsResult] = await Promise.all([
      api('/api/admin/profiles'),
      api('/api/admin/tiers'),
      api('/api/admin/groups'),
    ]);
    founderData = {
      profiles: profilesResult.profiles || [],
      tiers: tiersResult.tiers || [],
      groups: groupsResult.groups || [],
      resourceGrants: groupsResult.resourceGrants || [],
    };
    grid.replaceChildren();

    const profileSelect = h('select', { id: 'rackAdminProfile' });
    profileSelect.append(option('', 'Select a profile…'));
    for (const profile of founderData.profiles) {
      profileSelect.append(option(profile.id, `${profile.name || profile.email} · ${profile.role}`));
    }
    const profileRow = h('div', { class: 'rack-admin-row' });
    profileRow.append(h('label', { for: 'rackAdminProfile' }, 'Profile'), profileSelect);
    grid.append(profileRow);

    const detail = h('div', { id: 'rackAdminDetail', class: 'rack-admin-summary' }, 'Choose a profile to manage Rack-only access.');
    grid.append(detail);

    profileSelect.addEventListener('change', () => loadFounderProfile(profileSelect.value, grid, detail));
  }

  async function loadFounderProfile(identityId, grid, detail) {
    Array.from(grid.querySelectorAll('[data-profile-controls]')).forEach((node) => node.remove());
    if (!identityId) {
      detail.textContent = 'Choose a profile to manage Rack-only access.';
      return;
    }

    detail.textContent = 'Loading effective access…';
    const [profileResult, accessResult, historyResult] = await Promise.all([
      api(`/api/admin/profiles/${encodeURIComponent(identityId)}`),
      api(`/api/admin/profiles/${encodeURIComponent(identityId)}/access`),
      api(`/api/admin/profiles/${encodeURIComponent(identityId)}/history`),
    ]);
    const profile = profileResult.profile || accessResult.profile || {};
    const access = accessResult.access || {};
    detail.replaceChildren();
    detail.append(h('strong', {}, profile.name || profile.email || identityId));
    detail.append(document.createTextNode(`Global AeroVista role: ${profile.role || 'guest'} · Rack tier: ${access.tier || 'public'}`));

    const reasonInput = h('input', { type: 'text', placeholder: 'Reason for access change', maxlength: '500' });
    const reasonRow = h('div', { class: 'rack-admin-row', 'data-profile-controls': '1' });
    reasonRow.append(h('label', {}, 'Reason'), reasonInput);
    grid.append(reasonRow);

    const tierSelect = h('select');
    for (const tier of founderData.tiers) tierSelect.append(option(tier.id, tier.label));
    tierSelect.value = access.tier || 'public';
    const tierActions = h('div');
    const tierButton = h('button', { type: 'button', class: 'primary' }, 'Set tier');
    tierActions.append(tierSelect, document.createTextNode(' '), tierButton);
    const tierRow = h('div', { class: 'rack-admin-row', 'data-profile-controls': '1' });
    tierRow.append(h('label', {}, 'Rack tier'), tierActions);
    grid.append(tierRow);
    tierButton.addEventListener('click', async () => {
      await api(`/api/admin/profiles/${encodeURIComponent(identityId)}/tier`, {
        method: 'POST', body: { tier: tierSelect.value, reason: reasonInput.value },
      });
      await loadFounderProfile(identityId, grid, detail);
    });

    const activeGroups = new Set((access.groups || []).map((group) => group.id));
    const groupBox = h('div', { class: 'rack-group-list' });
    for (const group of founderData.groups) {
      const active = activeGroups.has(group.id);
      const chip = h('span', { class: 'rack-group-chip' });
      chip.append(document.createTextNode(group.label));
      const button = h('button', { type: 'button' }, active ? 'Remove' : 'Add');
      button.addEventListener('click', async () => {
        const path = `/api/admin/profiles/${encodeURIComponent(identityId)}/groups${active ? `/${encodeURIComponent(group.id)}` : ''}`;
        await api(path, { method: active ? 'DELETE' : 'POST', body: active ? { reason: reasonInput.value } : { group: group.id, reason: reasonInput.value } });
        await loadFounderProfile(identityId, grid, detail);
      });
      chip.append(button);
      groupBox.append(chip);
    }
    const groupRow = h('div', { class: 'rack-admin-row', 'data-profile-controls': '1' });
    groupRow.append(h('label', {}, 'Groups'), groupBox);
    grid.append(groupRow);

    const resourceWrap = h('div');
    const resourceType = h('input', { type: 'text', placeholder: 'series' });
    const resourceId = h('input', { type: 'text', placeholder: 'last-normal-night' });
    const resourceGrant = h('select');
    for (const grant of founderData.resourceGrants) resourceGrant.append(option(grant.id, grant.label));
    const assign = h('button', { type: 'button' }, 'Grant');
    const revoke = h('button', { type: 'button' }, 'Revoke');
    resourceWrap.append(resourceType, resourceId, resourceGrant, assign, revoke);
    const resourceRow = h('div', { class: 'rack-admin-row', 'data-profile-controls': '1' });
    resourceRow.append(h('label', {}, 'Resource access'), resourceWrap);
    grid.append(resourceRow);
    const mutateResource = async (method) => {
      const grant = resourceGrant.value;
      const path = `/api/admin/profiles/${encodeURIComponent(identityId)}/grants${method === 'DELETE' ? `/${encodeURIComponent(grant)}` : ''}`;
      await api(path, {
        method,
        body: { grant, resourceType: resourceType.value, resourceId: resourceId.value, reason: reasonInput.value },
      });
      await loadFounderProfile(identityId, grid, detail);
    };
    assign.addEventListener('click', () => mutateResource('POST'));
    revoke.addEventListener('click', () => mutateResource('DELETE'));

    const resourceSummary = h('div', { class: 'rack-admin-summary', 'data-profile-controls': '1' });
    resourceSummary.append(h('strong', {}, 'Active resource grants'));
    const resources = access.resources || [];
    resourceSummary.append(document.createTextNode(resources.length
      ? resources.map((item) => `${item.grant} @ ${item.resourceType}:${item.resourceId}`).join(' · ')
      : 'None'));
    grid.append(resourceSummary);

    const history = h('div', { class: 'rack-admin-summary', 'data-profile-controls': '1' });
    history.append(h('strong', {}, 'Rack access history'));
    const list = h('ul', { class: 'rack-history' });
    const events = historyResult.events || [];
    if (!events.length) list.append(h('li', { class: 'rack-muted' }, 'No Rack access changes recorded.'));
    for (const event of events.slice(0, 40)) {
      const reason = event.metadata?.reason ? ` — ${event.metadata.reason}` : '';
      list.append(h('li', {}, `${event.created_at || ''} · ${event.event_type}${reason}`));
    }
    history.append(list);
    grid.append(history);
  }

  async function refreshSession() {
    try {
      session = await api('/api/session');
    } catch {
      session = { authenticated: false, csrfToken: null };
    }
    updateButton();
    return session;
  }

  function updateButton() {
    if (!session.authenticated) {
      accountButton.textContent = 'Sign in';
      accountButton.title = 'Sign in with AeroVista Account';
      return;
    }
    const identity = session.identity || {};
    accountButton.textContent = identity.name ? `My Rack · ${identity.name.split(' ')[0]}` : 'My Rack';
    accountButton.title = `Signed in as ${identity.email || identity.name || 'AeroVista member'}`;
  }

  accountButton.addEventListener('click', async () => {
    const dialog = ensureDialog();
    if (!session.authenticated) return renderSignedOut(dialog);
    try { await renderSignedIn(dialog); }
    catch (error) {
      setStatus(error.message || 'Account service unavailable.', true);
      dialog.showModal();
    }
  });

  const authResult = new URLSearchParams(location.search).get('auth');
  refreshSession().then(() => {
    if (authResult === 'ok' && session.authenticated) {
      const clean = new URL(location.href);
      clean.searchParams.delete('auth');
      history.replaceState(null, '', clean);
    }
  });
})();
