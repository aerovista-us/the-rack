'use strict';

/**
 * The Rack — comic shelf + StPageFlip reader.
 * Image pages flip (aspect-fitted to art). Video "motion moments" play in a
 * separate overlay so controls work — PageFlip steals gestures from <video>.
 */

const PAGE_FLIP_CDN =
  'https://cdn.jsdelivr.net/npm/page-flip@2.0.7/dist/js/page-flip.browser.min.js';
const PAGE_FLIP_VENDOR = 'vendor/page-flip.browser.min.js';

const FLIP = {
  swipeDistance: 26,
  flippingTime: 1100,
  flippingTimeReducedMotion: 240,
  maxShadowOpacity: 0.58,
  /** Remodel SOS pages are ~1122×1402; used until first image reports natural size. */
  defaultAspect: 1122 / 1402,
  stagePad: 8,
};

const state = {
  data: null,
  book: null,
  index: 0,
  pageFlip: null,
  cleanup: null,
  /** sequence index → flip page index (images only) */
  seqToFlip: [],
  /** flip page index → sequence index */
  flipToSeq: [],
  aspect: FLIP.defaultAspect,
  flipW: 0,
  flipH: 0,
  mode: 'image', // 'image' | 'moment' | 'fallback'
};

const $ = (s) => document.querySelector(s);
const els = {
  grid: $('#bookGrid'),
  hero: $('#heroRack'),
  reader: $('#reader'),
  frame: $('#stageFrame'),
  stage: $('#readerStage'),
  moment: $('#momentStage'),
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

function waitLayout(cb) {
  requestAnimationFrame(() => {
    requestAnimationFrame(cb);
  });
}

function resolveUrl(relative) {
  return new URL(relative, window.location.href).href;
}

function buildIndexMaps(sequence) {
  const seqToFlip = [];
  const flipToSeq = [];
  let flip = 0;
  sequence.forEach((item, i) => {
    if (item.type === 'video') {
      seqToFlip[i] = -1;
    } else {
      seqToFlip[i] = flip;
      flipToSeq[flip] = i;
      flip += 1;
    }
  });
  return { seqToFlip, flipToSeq };
}

function measureFlipSize(aspect) {
  const host = els.frame || els.stage.parentElement || els.stage;
  const r = host.getBoundingClientRect();
  const vv = window.visualViewport;
  const pad = FLIP.stagePad;
  const availW = Math.max(200, Math.round((r.width > 2 ? r.width : vv?.width ?? window.innerWidth) - pad * 2));
  const availH = Math.max(240, Math.round((r.height > 2 ? r.height : vv?.height ?? window.innerHeight) - pad * 2));
  let w = availW;
  let h = Math.round(w / aspect);
  if (h > availH) {
    h = availH;
    w = Math.round(h * aspect);
  }
  return {
    w: Math.max(180, w),
    h: Math.max(220, h),
  };
}

function loadImageAspect(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        resolve(img.naturalWidth / img.naturalHeight);
      } else {
        resolve(FLIP.defaultAspect);
      }
    };
    img.onerror = () => resolve(FLIP.defaultAspect);
    img.src = resolveUrl(src);
  });
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
  els.stage.classList.remove('is-flip', 'is-fallback', 'is-hidden');
  els.stage.hidden = false;
  if (els.moment) {
    els.moment.innerHTML = '';
    els.moment.hidden = true;
    els.moment.classList.remove('is-active');
  }
  state.mode = 'image';
}

function buildImagePageElements(sequence, bookTitle, flipToSeq) {
  const frag = document.createDocumentFragment();
  const pages = [];
  let firstImage = false;

  flipToSeq.forEach((seqIndex, flipIndex) => {
    const item = sequence[seqIndex];
    const page = document.createElement('div');
    page.className = 'page';
    page.dataset.density = 'soft';
    page.dataset.seq = String(seqIndex);
    page.dataset.flip = String(flipIndex);

    const img = document.createElement('img');
    img.className = 'page__img';
    img.alt = item.alt || `${bookTitle}, page ${seqIndex + 1}`;
    img.decoding = 'async';
    img.loading = 'eager';
    img.draggable = false;
    if (!firstImage) {
      img.fetchPriority = 'high';
      firstImage = true;
    }
    img.src = resolveUrl(item.src);
    page.append(img);
    frag.append(page);
    pages.push(page);
  });

  return { frag, pages };
}

function buildMomentCard(item, seqIndex) {
  const wrap = document.createElement('div');
  wrap.className = 'video-card moment-card';
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
  v.setAttribute('controlsList', 'nodownload');
  if (item.poster) v.poster = item.poster;
  if (item.autoplay) {
    v.autoplay = true;
    v.muted = Boolean(item.muted ?? true);
  }
  if (item.advanceOnEnd) {
    v.addEventListener('ended', () => goTo(seqIndex + 1));
  }
  wrap.append(v);
  if (item.note) {
    const p = document.createElement('p');
    p.textContent = item.note;
    wrap.append(p);
  }
  return wrap;
}

function pauseMomentVideo() {
  els.moment?.querySelectorAll('video').forEach((v) => {
    try {
      v.pause();
    } catch (_) {
      /* ignore */
    }
  });
}

function preloadAround(sequence, index) {
  const neighbors = [sequence[index - 1], sequence[index + 1]].filter(Boolean);
  const seen = new Set();
  for (const item of neighbors) {
    if (item.type === 'video') continue;
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

function showMoment(seqIndex) {
  const item = state.book.sequence[seqIndex];
  state.mode = 'moment';
  state.index = seqIndex;
  pauseMomentVideo();
  els.moment.innerHTML = '';
  els.moment.append(buildMomentCard(item, seqIndex));
  els.moment.hidden = false;
  els.moment.classList.add('is-active');
  els.stage.classList.add('is-hidden');
  els.stage.setAttribute('aria-hidden', 'true');
  preloadAround(state.book.sequence, seqIndex);
  syncChrome();
}

function hideMoment() {
  pauseMomentVideo();
  els.moment.innerHTML = '';
  els.moment.hidden = true;
  els.moment.classList.remove('is-active');
  els.stage.classList.remove('is-hidden');
  els.stage.removeAttribute('aria-hidden');
}

function showFlipAtSeq(seqIndex, animate) {
  const flipIndex = state.seqToFlip[seqIndex];
  if (flipIndex < 0 || !state.pageFlip) {
    showMoment(seqIndex);
    return;
  }
  hideMoment();
  state.mode = 'image';
  state.index = seqIndex;

  const cur = state.pageFlip.getCurrentPageIndex();
  if (flipIndex === cur) {
    syncChrome();
    return;
  }
  if (animate && flipIndex === cur + 1) {
    state.pageFlip.flipNext('top');
    return;
  }
  if (animate && flipIndex === cur - 1) {
    state.pageFlip.flipPrev('top');
    return;
  }
  state.pageFlip.turnToPage(flipIndex);
  state.index = state.flipToSeq[state.pageFlip.getCurrentPageIndex()] ?? seqIndex;
  preloadAround(state.book.sequence, state.index);
  syncChrome();
}

function applyView(seqIndex, animate) {
  if (!state.book) return;
  const item = state.book.sequence[seqIndex];
  if (!item) return;
  if (item.type === 'video') {
    showMoment(seqIndex);
  } else if (state.pageFlip) {
    showFlipAtSeq(seqIndex, animate);
  } else {
    state.index = seqIndex;
    renderFallback();
  }
}

function initFlip(startSeqIndex) {
  const book = state.book;
  const PageFlip = globalThis.St.PageFlip;
  const bookEl = els.stage;
  const maps = buildIndexMaps(book.sequence);
  state.seqToFlip = maps.seqToFlip;
  state.flipToSeq = maps.flipToSeq;

  if (maps.flipToSeq.length === 0) {
    // Video-only book
    applyView(startSeqIndex, false);
    return;
  }

  waitLayout(() => {
    const { w, h } = measureFlipSize(state.aspect);
    state.flipW = w;
    state.flipH = h;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const flippingTime = reduceMotion ? FLIP.flippingTimeReducedMotion : FLIP.flippingTime;

    const { frag, pages } = buildImagePageElements(book.sequence, book.title, maps.flipToSeq);
    bookEl.append(frag);
    bookEl.classList.add('is-flip');

    let startFlip = maps.seqToFlip[startSeqIndex];
    if (startFlip < 0) {
      // Open nearest image under the hood; moment overlay covers it.
      startFlip = maps.seqToFlip.find((x) => x >= 0) ?? 0;
    }

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
      clickEventForward: false,
      useMouseEvents: true,
      startPage: startFlip,
      startZIndex: 0,
    });

    pf.loadFromHTML(pages);
    state.pageFlip = pf;

    pf.on('flip', () => {
      if (state.mode === 'moment') return;
      const flipIdx = pf.getCurrentPageIndex();
      const seqIdx = state.flipToSeq[flipIdx];
      if (typeof seqIdx !== 'number') return;
      state.index = seqIdx;
      preloadAround(book.sequence, seqIdx);
      syncChrome();
    });

    const scheduleReflow = () => {
      const size = measureFlipSize(state.aspect);
      if (
        state.pageFlip &&
        (Math.abs(size.w - state.flipW) >= 24 || Math.abs(size.h - state.flipH) >= 24)
      ) {
        const keep = state.index;
        const keepMode = state.mode;
        if (state.cleanup) {
          state.cleanup();
          state.cleanup = null;
        }
        try {
          state.pageFlip.destroy();
        } catch (_) {
          /* ignore */
        }
        state.pageFlip = null;
        els.stage.innerHTML = '';
        els.stage.classList.remove('is-flip', 'is-hidden');
        els.stage.style.width = '';
        els.stage.style.height = '';
        // Re-init at same sequence index (preserves moment vs image).
        state.index = keep;
        state.mode = keepMode;
        initFlip(keep);
        return;
      }
      try {
        const ui = pf.getUI?.();
        if (ui && typeof ui.update === 'function') ui.update();
        bookEl.style.width = `${state.flipW}px`;
        bookEl.style.height = `${state.flipH}px`;
      } catch (_) {
        /* ignore */
      }
    };

    bookEl.querySelectorAll('.page__img').forEach((img) => {
      img.addEventListener(
        'load',
        () => {
          if (img.naturalWidth > 0 && img.naturalHeight > 0) {
            const next = img.naturalWidth / img.naturalHeight;
            if (Math.abs(next - state.aspect) > 0.01) {
              state.aspect = next;
              // Soft reflow; full recreate on next open if needed.
              scheduleReflow();
            }
          }
          scheduleReflow();
        },
        { passive: true },
      );
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
      ro.observe(els.frame || bookEl.parentElement || bookEl);
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
      bookEl.style.width = '';
      bookEl.style.height = '';
    };

    scheduleReflow();
    applyView(startSeqIndex, false);
  });
}

function renderFallback() {
  destroyFlip();
  state.mode = 'fallback';
  els.stage.classList.add('is-fallback');
  els.stage.hidden = false;
  const item = state.book.sequence[state.index];
  if (item.type === 'video') {
    els.stage.append(buildMomentCard(item, state.index));
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

  const firstImage = state.book.sequence.find((x) => x.type !== 'video');
  if (firstImage) {
    state.aspect = await loadImageAspect(firstImage.src);
  } else {
    state.aspect = FLIP.defaultAspect;
  }

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
  const from = state.index;
  const animate = Math.abs(i - from) === 1;
  applyView(i, animate);
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
      if (sameBook && (state.pageFlip || state.mode === 'moment')) {
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
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'VIDEO' || tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (e.key === 'ArrowRight' || e.key === 'PageDown') goTo(state.index + 1);
  if (e.key === 'ArrowLeft' || e.key === 'PageUp') goTo(state.index - 1);
  if (e.key === 'Escape' && !document.fullscreenElement) closeReader();
});

loadRack();
