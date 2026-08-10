'use strict';

/**
 * The Rack — comic shelf + sequential reader.
 */

const state = {
  data: null,
  book: null,
  index: 0,
  touchArmed: false,
};

const $ = (s) => document.querySelector(s);
const els = {
  grid: $('#bookGrid'),
  hero: $('#heroRack'),
  reader: $('#reader'),
  stage: $('#readerStage'),
  rail: $('#thumbnailRail'),
  series: $('#readerBookSeries'),
  title: $('#readerBookTitle'),
  position: $('#readerPosition'),
  progress: $('#progressBar'),
  prev: $('#prevItem'),
  next: $('#nextItem'),
  search: $('#searchInput'),
  dialog: $('#helpDialog'),
  thumbsBtn: $('#toggleThumbs'),
  fullscreenBtn: $('#toggleFullscreen'),
  closeBtn: $('#closeReader'),
  brand: document.querySelector('.brand'),
};

const isCoarse = () =>
  window.matchMedia('(max-width: 760px), (pointer: coarse)').matches;

function supportsFullscreen() {
  const el = els.reader;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen);
}

async function loadRack() {
  try {
    const r = await fetch('rack.json', { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (!data || !Array.isArray(data.books)) throw new Error('Invalid catalog');
    state.data = data;
    document.title = `${data.site?.title || 'The Rack'} — ${data.site?.publisher || 'Vespera Publishing'}`;
    renderLibrary();
    route();
  } catch (err) {
    console.error(err);
    els.grid.innerHTML =
      `<div class="load-error"><h3>The shelf couldn't load</h3><p>Please refresh the page. If it still doesn't appear, try again in a moment.</p></div>`;
  }
}

function renderLibrary(filter = '') {
  if (!state.data) return;
  const q = filter.trim().toLowerCase();
  const books = state.data.books.filter((b) =>
    `${b.title} ${b.series || ''} ${b.creator} ${b.description} ${(b.tags || []).join(' ')}`
      .toLowerCase()
      .includes(q),
  );

  els.grid.innerHTML = '';
  els.hero.innerHTML = '';

  books.forEach((book, i) => {
    if (!book?.id || !Array.isArray(book.sequence)) return;

    const node = $('#bookCardTemplate').content.cloneNode(true);
    const img = node.querySelector('.book-cover');
    img.src = book.cover || '';
    img.alt = `${book.title} cover`;
    img.onerror = () => {
      img.replaceWith(Object.assign(document.createElement('div'), {
        className: 'book-cover',
        style: 'display:grid;place-items:center;color:#888;font-size:12px',
        textContent: 'Cover unavailable',
      }));
    };

    node.querySelector('.book-kicker').textContent = book.series || 'VESPERA ORIGINAL';
    node.querySelector('h3').textContent = book.title;
    node.querySelector('.book-author').textContent = book.creator ? `By ${book.creator}` : '';
    node.querySelector('.book-description').textContent = book.description || '';

    const pageCount = book.sequence.filter((x) => x.type !== 'video').length;
    const motionCount = book.sequence.filter((x) => x.type === 'video').length;
    node.querySelector('.item-count').textContent =
      motionCount > 0 ? `${pageCount} pages · ${motionCount} motion` : `${pageCount} pages`;

    node.querySelectorAll('button').forEach((btn) =>
      btn.addEventListener('click', () => openBook(book.id, 0)),
    );
    els.grid.append(node);

    if (i < 3 && book.cover) {
      const c = document.createElement('img');
      c.className = 'hero-cover';
      c.src = book.cover;
      c.alt = `${book.title} cover`;
      c.decoding = 'async';
      c.style.setProperty('--r', `${[-5, 2, 6][i]}deg`);
      c.style.setProperty('--y', `${[20, 0, 28][i]}px`);
      c.tabIndex = 0;
      c.addEventListener('click', () => openBook(book.id, 0));
      c.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openBook(book.id, 0);
        }
      });
      els.hero.append(c);
    }
  });

  if (!books.length) {
    els.grid.innerHTML = '<p class="load-error">No comics match that search.</p>';
  }
}

function openBook(id, index = 0) {
  const book = state.data?.books?.find((b) => b.id === id);
  if (!book?.sequence?.length) return;
  state.book = book;
  state.index = clampIndex(index);
  location.hash = `#/read/${encodeURIComponent(id)}/${state.index + 1}`;
  showReader();
}

function clampIndex(i) {
  return Math.max(0, Math.min(i, state.book.sequence.length - 1));
}

function showReader() {
  document.body.classList.add('reader-open');
  els.reader.hidden = false;
  if (els.series) {
    const series = state.book.series || '';
    els.series.textContent = series;
    els.series.hidden = !series;
  }
  els.title.textContent = state.book.title;

  if (els.fullscreenBtn) {
    els.fullscreenBtn.hidden = !supportsFullscreen();
  }

  // Mobile: thumbs closed by default so the page has room.
  if (isCoarse()) {
    els.rail.classList.add('collapsed');
    els.thumbsBtn?.setAttribute('aria-pressed', 'false');
  } else {
    els.rail.classList.remove('collapsed');
    els.thumbsBtn?.setAttribute('aria-pressed', 'true');
  }

  renderThumbs();
  renderItem();
  els.closeBtn?.focus?.();
}

function closeReader() {
  pauseActiveVideo();
  els.stage.innerHTML = '';
  els.reader.hidden = true;
  document.body.classList.remove('reader-open');
  if (document.fullscreenElement) {
    document.exitFullscreen?.().catch(() => {});
  }
  if (location.hash.startsWith('#/read/')) {
    history.replaceState(null, '', `${location.pathname}${location.search}#/`);
  }
}

function pauseActiveVideo() {
  els.stage.querySelectorAll('video').forEach((v) => {
    try {
      v.pause();
      v.removeAttribute('src');
      v.load();
    } catch (_) {
      /* ignore */
    }
  });
}

function renderThumbs() {
  els.rail.innerHTML = '';
  state.book.sequence.forEach((item, i) => {
    const b = document.createElement('button');
    const isVideo = item.type === 'video';
    b.type = 'button';
    b.className =
      'thumb' + (i === state.index ? ' active' : '') + (isVideo ? ' thumb--motion' : '');
    b.setAttribute(
      'aria-label',
      isVideo
        ? `Motion moment ${i + 1}${item.caption ? `: ${item.caption}` : ''}`
        : `Go to page ${i + 1}`,
    );
    if (i === state.index) b.setAttribute('aria-current', 'true');
    else b.removeAttribute('aria-current');

    if (isVideo) {
      const v = document.createElement('div');
      v.className = 'video-thumb';
      if (item.poster) {
        const img = document.createElement('img');
        img.src = item.poster;
        img.alt = '';
        img.className = 'video-thumb__poster';
        img.loading = 'lazy';
        v.append(img);
      }
      const badge = document.createElement('span');
      badge.className = 'video-thumb__badge';
      badge.textContent = 'MOTION';
      v.append(badge);
      const play = document.createElement('span');
      play.className = 'video-thumb__play';
      play.textContent = '▶';
      play.setAttribute('aria-hidden', 'true');
      v.append(play);
      b.append(v);
    } else {
      const img = document.createElement('img');
      img.src = item.src;
      img.alt = '';
      img.loading = 'lazy';
      b.append(img);
    }

    const n = document.createElement('span');
    n.className = 'thumb__num';
    n.textContent = String(i + 1);
    b.append(n);
    b.addEventListener('click', () => {
      goTo(i);
      if (isCoarse()) {
        els.rail.classList.add('collapsed');
        els.thumbsBtn?.setAttribute('aria-pressed', 'false');
      }
    });
    els.rail.append(b);
  });
}

function renderItem() {
  const item = state.book.sequence[state.index];
  if (!item) return;

  pauseActiveVideo();
  els.stage.innerHTML = '';
  els.stage.className = 'reader-stage';

  if (item.type === 'video') {
    const wrap = document.createElement('div');
    wrap.className = 'video-card';

    const kicker = document.createElement('p');
    kicker.className = 'moment-kicker';
    kicker.textContent = 'Motion moment';
    wrap.append(kicker);

    if (item.caption) {
      const h = document.createElement('h3');
      h.textContent = item.caption;
      wrap.append(h);
    }

    const v = document.createElement('video');
    v.src = item.src;
    v.controls = true;
    v.playsInline = true;
    v.preload = 'metadata';
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.controlsList = 'nodownload';
    if (item.poster) v.poster = item.poster;
    if (item.autoplay) {
      v.autoplay = true;
      v.muted = Boolean(item.muted ?? true);
    }
    if (item.advanceOnEnd) {
      v.addEventListener('ended', () => goTo(state.index + 1), { once: true });
    }
    v.addEventListener('error', () => {
      const p = document.createElement('p');
      p.textContent = 'This motion moment couldn’t play. Continue with the next page.';
      wrap.append(p);
    });
    wrap.append(v);

    if (item.note) {
      const p = document.createElement('p');
      p.textContent = item.note;
      wrap.append(p);
    }
    els.stage.append(wrap);
  } else {
    const shell = document.createElement('div');
    shell.className = 'page-shell is-loading';
    const img = document.createElement('img');
    img.src = item.src;
    img.alt = item.alt || `${state.book.title}, page ${state.index + 1}`;
    img.draggable = false;
    img.decoding = 'async';
    img.addEventListener('load', () => shell.classList.remove('is-loading'));
    img.addEventListener('error', () => {
      shell.classList.remove('is-loading');
      shell.replaceChildren(
        Object.assign(document.createElement('p'), {
          className: 'stage-error',
          textContent: 'This page couldn’t load. Try the next arrow.',
        }),
      );
    });
    shell.append(img);
    els.stage.append(shell);

    if (state.index === state.book.sequence.length - 1) {
      const end = document.createElement('button');
      end.type = 'button';
      end.className = 'end-shelf-btn';
      end.textContent = 'Back to the rack';
      end.addEventListener('click', closeReader);
      els.stage.append(end);
    }
  }

  const n = state.book.sequence.length;
  const kind = item.type === 'video' ? 'Motion' : 'Page';
  els.position.textContent = `${kind} · ${state.index + 1} / ${n}`;
  els.progress.style.width = `${((state.index + 1) / n) * 100}%`;
  els.prev.disabled = state.index === 0;
  els.next.disabled = state.index === n - 1;

  [...els.rail.children].forEach((x, i) => {
    const on = i === state.index;
    x.classList.toggle('active', on);
    if (on) x.setAttribute('aria-current', 'true');
    else x.removeAttribute('aria-current');
  });
  els.rail.children[state.index]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });

  history.replaceState(
    null,
    '',
    `#/read/${encodeURIComponent(state.book.id)}/${state.index + 1}`,
  );

  // Warm the next couple of images.
  for (let ahead = 1; ahead <= 2; ahead++) {
    const next = state.book.sequence[state.index + ahead];
    if (next?.type === 'image' && next.src) {
      const warm = new Image();
      warm.src = next.src;
    }
  }
}

function goTo(i) {
  if (!state.book || i < 0 || i >= state.book.sequence.length) return;
  state.index = i;
  renderItem();
}

function route() {
  if (!state.data) return;
  const p = location.hash.match(/^#\/read\/([^/]+)\/(\d+)/);
  if (p) {
    const b = state.data.books.find((x) => x.id === decodeURIComponent(p[1]));
    if (b?.sequence?.length) {
      state.book = b;
      state.index = clampIndex(Number(p[2]) - 1);
      showReader();
      return;
    }
  }
  if (!els.reader.hidden) closeReader();
}

els.prev.addEventListener('click', () => goTo(state.index - 1));
els.next.addEventListener('click', () => goTo(state.index + 1));
els.closeBtn.addEventListener('click', closeReader);

els.thumbsBtn?.addEventListener('click', () => {
  const collapsed = els.rail.classList.toggle('collapsed');
  els.thumbsBtn.setAttribute('aria-pressed', collapsed ? 'false' : 'true');
});

els.fullscreenBtn?.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else if (els.reader.requestFullscreen) {
      await els.reader.requestFullscreen();
    } else if (els.reader.webkitRequestFullscreen) {
      els.reader.webkitRequestFullscreen();
    }
  } catch (_) {
    /* ignore unsupported / denied */
  }
});

els.search.addEventListener('input', (e) => renderLibrary(e.target.value));

['#openHelp', '#openQuickStart'].forEach((s) => {
  $(s)?.addEventListener('click', () => els.dialog.showModal());
});

els.dialog?.addEventListener('close', () => {
  if (els.dialog.returnValue === 'close' && !location.hash.startsWith('#/read/')) {
    document.querySelector('#library')?.scrollIntoView({ behavior: 'smooth' });
  }
});

window.addEventListener('hashchange', route);

els.brand?.addEventListener('click', (e) => {
  if (!els.reader.hidden) {
    e.preventDefault();
    closeReader();
  }
});

window.addEventListener('keydown', (e) => {
  if (els.dialog?.open) return;
  if (els.reader.hidden) return;
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'VIDEO' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  if (e.key === 'ArrowRight' || e.key === 'PageDown') {
    e.preventDefault();
    goTo(state.index + 1);
  }
  if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
    e.preventDefault();
    goTo(state.index - 1);
  }
  if (e.key === 'Home') {
    e.preventDefault();
    goTo(0);
  }
  if (e.key === 'End') {
    e.preventDefault();
    goTo(state.book.sequence.length - 1);
  }
  if (e.key === ' ') {
    const video = els.stage.querySelector('video');
    if (video && !video.paused) return;
    e.preventDefault();
    goTo(state.index + 1);
  }
  if (e.key === 'Escape' && !document.fullscreenElement) {
    if (isCoarse() && !els.rail.classList.contains('collapsed')) {
      els.rail.classList.add('collapsed');
      els.thumbsBtn?.setAttribute('aria-pressed', 'false');
      return;
    }
    closeReader();
  }
});

els.stage.addEventListener('click', (e) => {
  if (e.target.closest('video, button, a, .video-card')) return;
  const rect = els.stage.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const third = rect.width / 3;
  if (x < third) goTo(state.index - 1);
  else if (x > third * 2) goTo(state.index + 1);
});

let touchX = 0;
let touchY = 0;
els.stage.addEventListener(
  'touchstart',
  (e) => {
    if (e.target.closest('video, button, a, input')) {
      state.touchArmed = false;
      return;
    }
    state.touchArmed = true;
    touchX = e.changedTouches[0].clientX;
    touchY = e.changedTouches[0].clientY;
  },
  { passive: true },
);
els.stage.addEventListener(
  'touchend',
  (e) => {
    if (!state.touchArmed) return;
    state.touchArmed = false;
    const dx = e.changedTouches[0].clientX - touchX;
    const dy = e.changedTouches[0].clientY - touchY;
    if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy)) return;
    goTo(state.index + (dx < 0 ? 1 : -1));
  },
  { passive: true },
);

window.addEventListener('resize', () => {
  if (els.reader.hidden || !els.fullscreenBtn) return;
  els.fullscreenBtn.hidden = !supportsFullscreen();
});

loadRack();
