'use strict';

/**
 * The Rack — comic shelf + StPageFlip reader.
 * Page-turn / mobile sizing adapted from the_rack/template magazine viewer.
 */

const PAGE_FLIP_CDN =
  'https://cdn.jsdelivr.net/npm/page-flip@2.0.7/dist/js/page-flip.browser.min.js';
const PAGE_FLIP_VENDOR = 'vendor/page-flip.browser.min.js';

const FLIP = {
  swipeDistance: 26,
  flippingTime: 1100,
  flippingTimeReducedMotion: 240,
  maxShadowOpacity: 0.58,
};

const state = {
  data: null,
  book: null,
  index: 0,
  pageFlip: null,
  cleanup: null,
};

const $ = (s) => document.querySelector(s);
const els = {
  grid: $('#bookGrid'),
  hero: $('#heroRack'),
  reader: $('#reader'),
  stage: $('#readerStage'),
  rail: $('#thumbnailRail'),
  title: $('#readerBookTitle'),
  position: $('#readerPosition'),
  progress: $('#progressBar'),
  prev: $('#prevItem'),
  next: $('#nextItem'),
  search: $('#searchInput'),
  dialog: $('#helpDialog'),
};

function injectScriptSrc(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(s);
  });
}

async function injectScriptFromUrl(sourceUrl) {
  const res = await fetch(sourceUrl, { cache: 'force-cache', credentials: 'omit' });
  if (!res.ok) throw new Error(`${sourceUrl} → HTTP ${res.status}`);
  const text = await res.text();
  const blob = new Blob([text], { type: 'application/javascript' });
  const blobUrl = URL.createObjectURL(blob);
  try {
    await injectScriptSrc(blobUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

async function ensurePageFlip() {
  if (globalThis.St?.PageFlip) return;
  let lastErr = null;
  for (const url of [PAGE_FLIP_CDN, PAGE_FLIP_VENDOR]) {
    try {
      await injectScriptFromUrl(url);
      if (globalThis.St?.PageFlip) return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('page-flip library did not register global St.PageFlip');
}

function measureBook(bookEl) {
  const r = bookEl.getBoundingClientRect();
  const vv = window.visualViewport;
  const w = Math.round(r.width > 2 ? r.width : vv?.width ?? window.innerWidth);
  const h = Math.round(r.height > 2 ? r.height : vv?.height ?? window.innerHeight);
  return {
    w: Math.max(240, w),
    h: Math.max(320, h),
  };
}

function waitLayout(el, cb) {
  requestAnimationFrame(() => {
    requestAnimationFrame(cb);
  });
}

function resolveUrl(relative) {
  return new URL(relative, window.location.href).href;
}

async function loadRack() {
  try {
    const r = await fetch('rack.json', { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    state.data = await r.json();
    renderLibrary();
    route();
  } catch (err) {
    els.grid.innerHTML =
      `<div class="load-error"><h3>The shelf couldn't load</h3><p>Please refresh the page. If it still doesn't appear, try again in a moment.</p></div>`;
  }
}

function renderLibrary(filter = '') {
  const books = state.data.books.filter((b) =>
    `${b.title} ${b.creator} ${b.description}`.toLowerCase().includes(filter.toLowerCase()),
  );
  els.grid.innerHTML = '';
  els.hero.innerHTML = '';

  books.forEach((book, i) => {
    const node = $('#bookCardTemplate').content.cloneNode(true);
    const img = node.querySelector('.book-cover');
    img.src = book.cover;
    img.alt = `${book.title} cover`;
    node.querySelector('.book-kicker').textContent = book.series || 'VESPERA ORIGINAL';
    node.querySelector('h3').textContent = book.title;
    node.querySelector('.book-author').textContent = `By ${book.creator}`;
    node.querySelector('.book-description').textContent = book.description || '';
    node.querySelector('.item-count').textContent = `${book.sequence.length} pages`;
    node.querySelectorAll('button').forEach((btn) =>
      btn.addEventListener('click', () => openBook(book.id, 0)),
    );
    els.grid.append(node);

    if (i < 3) {
      const c = document.createElement('img');
      c.className = 'hero-cover';
      c.src = book.cover;
      c.alt = '';
      c.style.setProperty('--r', `${[-5, 2, 6][i]}deg`);
      c.style.setProperty('--y', `${[20, 0, 28][i]}px`);
      c.addEventListener('click', () => openBook(book.id, 0));
      els.hero.append(c);
    }
  });

  if (!books.length) els.grid.innerHTML = '<p>No comics match that search.</p>';
}

function destroyFlip() {
  if (state.cleanup) {
    state.cleanup();
    state.cleanup = null;
  }
  if (state.pageFlip) {
    try {
      state.pageFlip.destroy();
    } catch (_) {
      /* ignore */
    }
    state.pageFlip = null;
  }
  els.stage.innerHTML = '';
  els.stage.classList.remove('is-flip', 'is-fallback');
}

function buildPageElements(sequence, bookTitle) {
  const frag = document.createDocumentFragment();
  const pages = [];
  let firstImage = false;

  sequence.forEach((item, i) => {
    const page = document.createElement('div');
    page.className = 'page';
    page.dataset.density = 'soft';
    page.dataset.index = String(i);

    if (item.type === 'video') {
      page.classList.add('page--video');
      const wrap = document.createElement('div');
      wrap.className = 'video-card';
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
      if (item.poster) v.poster = item.poster;
      if (item.autoplay) {
        v.autoplay = true;
        v.muted = Boolean(item.muted ?? true);
      }
      if (item.advanceOnEnd) {
        v.addEventListener('ended', () => goTo(i + 1));
      }
      wrap.append(v);
      if (item.note) {
        const p = document.createElement('p');
        p.textContent = item.note;
        wrap.append(p);
      }
      page.append(wrap);
    } else {
      const img = document.createElement('img');
      img.className = 'page__img';
      img.alt = item.alt || `${bookTitle}, page ${i + 1}`;
      img.decoding = 'async';
      img.loading = 'eager';
      img.draggable = false;
      if (!firstImage) {
        img.fetchPriority = 'high';
        firstImage = true;
      }
      img.src = resolveUrl(item.src);
      page.append(img);
    }

    frag.append(page);
    pages.push(page);
  });

  return { frag, pages };
}

function pauseOffscreenVideos(activeIndex) {
  els.stage.querySelectorAll('.page').forEach((page) => {
    const idx = Number(page.dataset.index);
    page.querySelectorAll('video').forEach((v) => {
      if (idx !== activeIndex) {
        try {
          v.pause();
        } catch (_) {
          /* ignore */
        }
      }
    });
  });
}

function preloadAround(sequence, index) {
  const neighbors = [sequence[index - 1], sequence[index + 1]].filter(Boolean);
  const seen = new Set();
  for (const item of neighbors) {
    if (item.type !== 'image') continue;
    const url = resolveUrl(item.src);
    if (seen.has(url)) continue;
    seen.add(url);
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
  }
}

function syncChrome() {
  if (!state.book) return;
  const n = state.book.sequence.length;
  const i = state.index;
  els.position.textContent = `${i + 1} / ${n}`;
  els.progress.style.width = `${((i + 1) / n) * 100}%`;
  els.prev.disabled = i <= 0;
  els.next.disabled = i >= n - 1;
  [...els.rail.children].forEach((x, ti) => x.classList.toggle('active', ti === i));
  els.rail.children[i]?.scrollIntoView({ block: 'nearest' });
  history.replaceState(
    null,
    '',
    `#/read/${encodeURIComponent(state.book.id)}/${i + 1}`,
  );
}

function renderThumbs() {
  els.rail.innerHTML = '';
  state.book.sequence.forEach((item, i) => {
    const b = document.createElement('button');
    b.className = 'thumb' + (i === state.index ? ' active' : '');
    b.setAttribute('aria-label', `Go to item ${i + 1}`);
    if (item.type === 'image') {
      const img = document.createElement('img');
      img.src = item.src;
      img.alt = '';
      b.append(img);
    } else {
      const v = document.createElement('div');
      v.className = 'video-thumb';
      v.textContent = '▶';
      b.append(v);
    }
    const n = document.createElement('span');
    n.textContent = i + 1;
    b.append(n);
    b.onclick = () => goTo(i);
    els.rail.append(b);
  });
}

function initFlip(startIndex) {
  const book = state.book;
  const PageFlip = globalThis.St.PageFlip;
  const bookEl = els.stage;

  waitLayout(bookEl, () => {
    const { w, h } = measureBook(bookEl);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const flippingTime = reduceMotion ? FLIP.flippingTimeReducedMotion : FLIP.flippingTime;

    const { frag, pages } = buildPageElements(book.sequence, book.title);
    bookEl.append(frag);
    bookEl.classList.add('is-flip');

    const safeStart = Math.max(0, Math.min(startIndex, pages.length - 1));

    const pf = new PageFlip(bookEl, {
      width: w,
      height: h,
      size: 'fixed',
      minWidth: w,
      maxWidth: w,
      minHeight: h,
      maxHeight: h,
      drawShadow: true,
      flippingTime,
      maxShadowOpacity: FLIP.maxShadowOpacity,
      usePortrait: true,
      autoSize: false,
      mobileScrollSupport: true,
      swipeDistance: FLIP.swipeDistance,
      showCover: false,
      showPageCorners: true,
      clickEventForward: true,
      useMouseEvents: true,
      startPage: safeStart,
      startZIndex: 0,
    });

    pf.loadFromHTML(pages);
    state.pageFlip = pf;
    state.index = pf.getCurrentPageIndex();
    preloadAround(book.sequence, state.index);
    pauseOffscreenVideos(state.index);
    syncChrome();

    pf.on('flip', () => {
      state.index = pf.getCurrentPageIndex();
      preloadAround(book.sequence, state.index);
      pauseOffscreenVideos(state.index);
      syncChrome();
    });

    const scheduleReflow = () => {
      const ui = pf.getUI?.();
      if (ui && typeof ui.update === 'function') ui.update();
    };

    bookEl.querySelectorAll('.page__img').forEach((img) => {
      img.addEventListener('load', () => scheduleReflow(), { passive: true });
    });

    let resizeT = 0;
    const onResize = () => {
      window.clearTimeout(resizeT);
      resizeT = window.setTimeout(scheduleReflow, 80);
    };

    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onResize, { passive: true });
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', onResize, { passive: true });
      vv.addEventListener('scroll', onResize, { passive: true });
    }

    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => scheduleReflow());
      ro.observe(bookEl);
    }

    state.cleanup = () => {
      window.clearTimeout(resizeT);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      if (vv) {
        vv.removeEventListener('resize', onResize);
        vv.removeEventListener('scroll', onResize);
      }
      if (ro) ro.disconnect();
    };

    scheduleReflow();
  });
}

function renderFallback() {
  els.stage.classList.add('is-fallback');
  const item = state.book.sequence[state.index];
  els.stage.innerHTML = '';
  if (item.type === 'video') {
    const wrap = document.createElement('div');
    wrap.className = 'video-card';
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
    if (item.poster) v.poster = item.poster;
    if (item.autoplay) {
      v.autoplay = true;
      v.muted = Boolean(item.muted ?? true);
    }
    if (item.advanceOnEnd) v.addEventListener('ended', () => goTo(state.index + 1));
    wrap.append(v);
    if (item.note) {
      const p = document.createElement('p');
      p.textContent = item.note;
      wrap.append(p);
    }
    els.stage.append(wrap);
  } else {
    const img = document.createElement('img');
    img.src = item.src;
    img.alt = item.alt || `${state.book.title}, page ${state.index + 1}`;
    img.draggable = false;
    els.stage.append(img);
  }
  syncChrome();
}

async function showReader() {
  document.body.style.overflow = 'hidden';
  els.reader.hidden = false;
  els.title.textContent = state.book.title;
  renderThumbs();
  destroyFlip();

  try {
    await ensurePageFlip();
    initFlip(state.index);
  } catch (err) {
    console.warn('PageFlip unavailable, using fallback reader:', err);
    renderFallback();
  }

  els.reader.focus?.();
}

function closeReader() {
  destroyFlip();
  els.reader.hidden = true;
  document.body.style.overflow = '';
  location.hash = '#/';
}

function openBook(id, index = 0) {
  const book = state.data.books.find((b) => b.id === id);
  if (!book) return;
  state.book = book;
  state.index = Math.max(0, Math.min(index, book.sequence.length - 1));
  location.hash = `#/read/${encodeURIComponent(id)}/${state.index + 1}`;
  showReader();
}

function goTo(i) {
  if (!state.book || i < 0 || i >= state.book.sequence.length) return;

  if (state.pageFlip) {
    const cur = state.pageFlip.getCurrentPageIndex();
    if (i === cur) return;
    if (i === cur + 1) {
      state.pageFlip.flipNext('top');
      return;
    }
    if (i === cur - 1) {
      state.pageFlip.flipPrev('top');
      return;
    }
    state.pageFlip.turnToPage(i);
    state.index = state.pageFlip.getCurrentPageIndex();
    pauseOffscreenVideos(state.index);
    syncChrome();
    return;
  }

  state.index = i;
  renderFallback();
}

function route() {
  const p = location.hash.match(/^#\/read\/([^/]+)\/(\d+)/);
  if (p) {
    const b = state.data.books.find((x) => x.id === decodeURIComponent(p[1]));
    if (b) {
      const nextIndex = Math.min(Math.max(Number(p[2]) - 1, 0), b.sequence.length - 1);
      const sameBook = state.book?.id === b.id && !els.reader.hidden;
      state.book = b;
      state.index = nextIndex;
      if (sameBook && state.pageFlip) {
        goTo(nextIndex);
      } else {
        showReader();
      }
      return;
    }
  }
  if (!els.reader.hidden) closeReader();
}

els.prev.onclick = () => goTo(state.index - 1);
els.next.onclick = () => goTo(state.index + 1);
$('#closeReader').onclick = closeReader;
$('#toggleThumbs').onclick = () => els.rail.classList.toggle('collapsed');
$('#toggleFullscreen').onclick = () =>
  document.fullscreenElement
    ? document.exitFullscreen()
    : els.reader.requestFullscreen();
els.search.addEventListener('input', (e) => renderLibrary(e.target.value));
['#openHelp', '#openQuickStart'].forEach((s) => ($(s).onclick = () => els.dialog.showModal()));
window.addEventListener('hashchange', route);
window.addEventListener('keydown', (e) => {
  if (els.reader.hidden) return;
  if (e.key === 'ArrowRight' || e.key === 'PageDown') goTo(state.index + 1);
  if (e.key === 'ArrowLeft' || e.key === 'PageUp') goTo(state.index - 1);
  if (e.key === 'Escape' && !document.fullscreenElement) closeReader();
});

loadRack();
