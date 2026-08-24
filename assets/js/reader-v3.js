'use strict';

/**
 * The Rack Reader v3
 * Mobile-first physical comic pages + guided Panel Focus.
 * Loaded after v2.js so the v2 shelf/discovery layer stays intact.
 */

const rackV3 = {
  pageFlip: null,
  panelMode: false,
  panelIndex: 0,
  panelRegions: [],
  resizeTimer: null,
  renderToken: 0,
  formatCache: new Map(),
};

const panelBtn = document.querySelector('#panelFocus');
const MODE_KEY = 'rack.v3.readerMode';
state.readerMode = localStorage.getItem(MODE_KEY) || 'book';

function viewportSize() {
  const vv = window.visualViewport;
  return {
    width: Math.max(1, Math.round(vv?.width || window.innerWidth)),
    height: Math.max(1, Math.round(vv?.height || window.innerHeight)),
  };
}

function activeItem() {
  return state.book?.sequence?.[state.index] || null;
}

function destroyBook() {
  try { rackV3.pageFlip?.destroy?.(); } catch (err) { console.warn('PageFlip destroy failed', err); }
  rackV3.pageFlip = null;
}

async function bookFormat(book) {
  if (book?.format?.width && book?.format?.height) return book.format;
  if (rackV3.formatCache.has(book.id)) return rackV3.formatCache.get(book.id);
  const sample = (book.sequence || []).find((x) => x.type === 'image' && x.src);
  const fallback = { width: 900, height: 1200 };
  if (!sample) return fallback;
  const result = await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 900, height: img.naturalHeight || 1200 });
    img.onerror = () => resolve(fallback);
    img.src = sample.src;
  });
  rackV3.formatCache.set(book.id, result);
  return result;
}

function pageBounds(format) {
  const viewport = viewportSize();
  const rect = els.stage.getBoundingClientRect();
  const width = Math.max(1, rect.width || viewport.width);
  const height = Math.max(1, rect.height || viewport.height);
  const ratio = Math.max(.2, Number(format.height) / Math.max(1, Number(format.width)));
  const spread = width >= 720 && width / height > 1.08;
  const edge = width < 600 ? 3 : 12;
  const maxW = (width - edge * 2 - (spread ? 8 : 0)) / (spread ? 2 : 1);
  const fitW = Math.floor(Math.min(maxW, (height - edge * 2) / ratio));
  return {
    spread,
    width: Math.max(80, fitW),
    height: Math.max(100, Math.floor(fitW * ratio)),
  };
}

function makePaperPage(item, index) {
  const page = document.createElement('div');
  page.className = 'rack-paper-page';
  page.dataset.sequenceIndex = String(index);
  if (item.turn === 'rigid') page.dataset.density = 'hard';

  if (item.type === 'video') {
    page.classList.add('rack-paper-page--motion');
    const wrap = document.createElement('div');
    wrap.className = 'rack-paper-motion';
    wrap.innerHTML = `<p class="moment-kicker">Motion moment</p>${item.caption ? `<h3>${esc(item.caption)}</h3>` : ''}`;
    const video = document.createElement('video');
    video.src = item.src;
    video.controls = true;
    video.preload = 'metadata';
    video.playsInline = true;
    video.controlsList = 'nodownload';
    if (item.poster) video.poster = item.poster;
    if (item.advanceOnEnd) video.addEventListener('ended', () => rackV3.pageFlip?.flipNext('top'));
    wrap.append(video);
    page.append(wrap);
  } else {
    const img = document.createElement('img');
    img.className = 'rack-paper-media';
    img.src = item.src;
    img.alt = item.alt || `${state.book.title}, page ${index + 1}`;
    img.draggable = false;
    img.decoding = 'async';
    page.append(img);
  }
  return page;
}

function syncChrome(index = state.index) {
  const seq = state.book?.sequence || [];
  if (!seq.length) return;
  state.index = Math.max(0, Math.min(index, seq.length - 1));
  const item = seq[state.index];
  setProgress(state.book, state.index);
  els.position.textContent = `${item?.type === 'video' ? 'Motion' : 'Page'} · ${state.index + 1} / ${seq.length}`;
  els.progress.style.width = `${((state.index + 1) / seq.length) * 100}%`;
  els.prev.disabled = state.index <= 0;
  els.next.disabled = state.index >= seq.length - 1;
  [...els.rail.children].forEach((node, i) => {
    const active = i === state.index;
    node.classList.toggle('active', active);
    if (active) node.setAttribute('aria-current', 'true');
    else node.removeAttribute('aria-current');
  });
  els.rail.children[state.index]?.scrollIntoView({ block: 'nearest' });
  history.replaceState(null, '', `#/read/${encodeURIComponent(state.book.id)}/${state.index + 1}`);
  renderSeriesNav();
  document.querySelector('.end-card')?.remove();
  if (state.index === seq.length - 1) renderEndCard();
}

async function renderPhysicalBook() {
  const token = ++rackV3.renderToken;
  destroyBook();
  pauseActiveVideo();
  document.body.classList.remove('reader-motion', 'panel-focus-open');
  els.stage.className = 'reader-stage reader-stage--physical';
  els.stage.innerHTML = '';

  if (!window.St?.PageFlip) {
    state.readerMode = 'focus';
    renderFlatPage();
    return;
  }

  const format = await bookFormat(state.book);
  if (token !== rackV3.renderToken || rackV3.panelMode || state.readerMode !== 'book') return;
  const bounds = pageBounds(format);
  const host = document.createElement('div');
  host.id = 'rackPhysicalBook';
  host.className = 'rack-physical-book';
  host.style.width = `${bounds.width * (bounds.spread ? 2 : 1)}px`;
  host.style.height = `${bounds.height}px`;
  els.stage.append(host);
  state.book.sequence.forEach((item, i) => host.append(makePaperPage(item, i)));

  const flip = new St.PageFlip(host, {
    width: Number(format.width) || 900,
    height: Number(format.height) || 1200,
    size: 'stretch',
    minWidth: Math.min(100, bounds.width),
    maxWidth: bounds.width,
    minHeight: Math.min(120, bounds.height),
    maxHeight: bounds.height,
    maxShadowOpacity: .58,
    showCover: false,
    mobileScrollSupport: false,
    usePortrait: true,
    autoSize: false,
    drawShadow: true,
    showPageCorners: true,
    flippingTime: matchMedia('(prefers-reduced-motion: reduce)').matches ? 180 : 720,
    startPage: Math.max(0, Math.min(state.index, state.book.sequence.length - 1)),
  });
  rackV3.pageFlip = flip;
  flip.on('init', () => syncChrome(flip.getCurrentPageIndex?.() ?? state.index));
  flip.on('flip', (event) => syncChrome(Number(event?.data ?? flip.getCurrentPageIndex?.() ?? state.index)));
  flip.loadFromHTML(host.querySelectorAll('.rack-paper-page'));
  els.stage.dataset.pageOrientation = bounds.spread ? 'spread' : 'portrait';
  syncChrome(state.index);
}

function renderFlatPage() {
  destroyBook();
  pauseActiveVideo();
  document.body.classList.remove('reader-motion', 'panel-focus-open');
  const item = activeItem();
  if (!item) return;
  els.stage.innerHTML = '';
  els.stage.className = 'reader-stage reader-stage--flat';
  if (item.type === 'video') renderVideo(item);
  else els.stage.append(makePage(item, state.index));
  syncChrome(state.index);
}

function normalizeRegion(region) {
  const x = Math.max(0, Math.min(1, Number(region?.x) || 0));
  const y = Math.max(0, Math.min(1, Number(region?.y) || 0));
  const w = Math.max(.05, Math.min(1 - x, Number(region?.w) || 1));
  const h = Math.max(.05, Math.min(1 - y, Number(region?.h) || 1));
  return { x, y, w, h, label: region?.label || '' };
}

function mappedRegions(item) {
  const regions = item?.focusRegions || item?.panels;
  return Array.isArray(regions) ? regions.map(normalizeRegion) : [];
}

function smartRegions(img) {
  // Safe fallback for unmapped pages: six overlapping readable targets.
  // Exact comic-panel rectangles can be supplied in rack.json per page.
  const landscape = img.naturalWidth > img.naturalHeight;
  const cols = landscape ? 3 : 2;
  const rows = landscape ? 2 : 3;
  const overlapX = .035;
  const overlapY = .03;
  const cellW = 1 / cols;
  const cellH = 1 / rows;
  const regions = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = Math.max(0, col * cellW - (col ? overlapX : 0));
      const y = Math.max(0, row * cellH - (row ? overlapY : 0));
      regions.push(normalizeRegion({
        x,
        y,
        w: Math.min(1 - x, cellW + overlapX * 2),
        h: Math.min(1 - y, cellH + overlapY * 2),
      }));
    }
  }
  return regions;
}

function focusTransform(stage, img, region) {
  const rect = stage.getBoundingClientRect();
  const nw = img.naturalWidth || 1;
  const nh = img.naturalHeight || 1;
  const pad = Math.max(8, Math.min(rect.width, rect.height) * .025);
  const scale = Math.min(
    (rect.width - pad * 2) / (nw * region.w),
    (rect.height - pad * 2) / (nh * region.h),
  );
  const cx = (region.x + region.w / 2) * nw;
  const cy = (region.y + region.h / 2) * nh;
  img.style.width = `${nw}px`;
  img.style.height = `${nh}px`;
  img.style.transform = `translate3d(${rect.width / 2 - cx * scale}px, ${rect.height / 2 - cy * scale}px, 0) scale(${scale})`;
}

function nearestImage(start, direction) {
  const seq = state.book?.sequence || [];
  for (let i = start; i >= 0 && i < seq.length; i += direction) {
    if (seq[i]?.type === 'image') return i;
  }
  return -1;
}

function panelChrome() {
  els.position.textContent = `Panel ${rackV3.panelIndex + 1} / ${Math.max(1, rackV3.panelRegions.length)} · Page ${state.index + 1}`;
  panelBtn?.setAttribute('aria-pressed', 'true');
  panelBtn?.classList.add('active');
}

function renderPanelFocus() {
  destroyBook();
  pauseActiveVideo();
  const item = activeItem();
  if (!item || item.type !== 'image') {
    rackV3.panelMode = false;
    renderItem();
    return;
  }
  document.body.classList.add('panel-focus-open');
  els.stage.innerHTML = '';
  els.stage.className = 'reader-stage reader-stage--panel';
  const stage = document.createElement('div');
  stage.className = 'panel-focus-stage';
  const img = document.createElement('img');
  img.className = 'panel-focus-image';
  img.src = item.src;
  img.alt = item.alt || `${state.book.title}, page ${state.index + 1}`;
  img.draggable = false;
  stage.append(img);
  const badge = document.createElement('div');
  badge.className = 'panel-focus-badge';
  badge.textContent = 'PANEL FOCUS · TAP / SPACE →';
  stage.append(badge);
  els.stage.append(stage);
  img.addEventListener('load', () => {
    const exact = mappedRegions(item);
    rackV3.panelRegions = exact.length ? exact : smartRegions(img);
    rackV3.panelIndex = Math.max(0, Math.min(rackV3.panelIndex, rackV3.panelRegions.length - 1));
    stage.dataset.focusSource = exact.length ? 'mapped' : 'smart';
    focusTransform(stage, img, rackV3.panelRegions[rackV3.panelIndex]);
    panelChrome();
    track('panel_focus_open', { book: state.book.id, page: state.index + 1, source: stage.dataset.focusSource });
  }, { once: true });
  syncChrome(state.index);
  panelChrome();
}

function enterPanelFocus() {
  let index = nearestImage(state.index, 1);
  if (index < 0) index = nearestImage(state.index, -1);
  if (index < 0) return;
  state.index = index;
  rackV3.panelMode = true;
  rackV3.panelIndex = 0;
  renderPanelFocus();
}

function exitPanelFocus() {
  rackV3.panelMode = false;
  rackV3.panelRegions = [];
  rackV3.panelIndex = 0;
  panelBtn?.setAttribute('aria-pressed', 'false');
  panelBtn?.classList.remove('active');
  document.body.classList.remove('panel-focus-open');
  renderItem();
}

function advancePanel(delta = 1) {
  const next = rackV3.panelIndex + delta;
  if (next >= 0 && next < rackV3.panelRegions.length) {
    rackV3.panelIndex = next;
    const stage = els.stage.querySelector('.panel-focus-stage');
    const img = els.stage.querySelector('.panel-focus-image');
    if (stage && img) focusTransform(stage, img, rackV3.panelRegions[next]);
    panelChrome();
    return;
  }
  if (delta < 0) {
    const prior = nearestImage(state.index - 1, -1);
    if (prior >= 0) {
      state.index = prior;
      rackV3.panelIndex = Number.MAX_SAFE_INTEGER;
      renderPanelFocus();
    }
    return;
  }
  const nextItem = state.index + 1;
  if (nextItem >= state.book.sequence.length) return;
  state.index = nextItem;
  if (activeItem()?.type === 'image') {
    rackV3.panelIndex = 0;
    renderPanelFocus();
  } else {
    rackV3.panelMode = false;
    panelBtn?.setAttribute('aria-pressed', 'false');
    document.body.classList.remove('panel-focus-open');
    renderFlatPage();
  }
}

// Override only the v2 reader functions. The shelf stays v2.
showReader = function showReaderV3() {
  document.body.classList.add('reader-open');
  els.reader.hidden = false;
  els.series.textContent = state.book.series || '';
  els.series.hidden = !state.book.series;
  els.title.textContent = state.book.title;
  state.readerMode = localStorage.getItem(MODE_KEY) || state.book.readerMode || 'book';
  if (!['book', 'focus'].includes(state.readerMode)) state.readerMode = 'book';
  rackV3.panelMode = false;
  updateModeButton();
  panelBtn?.setAttribute('aria-pressed', 'false');
  if (els.fullscreenBtn) els.fullscreenBtn.hidden = !supportsFullscreen();
  els.rail.classList.add('collapsed');
  els.thumbsBtn?.setAttribute('aria-pressed', 'false');
  renderThumbs();
  renderItem();
  renderSeriesNav();
};

closeReader = function closeReaderV3() {
  ++rackV3.renderToken;
  destroyBook();
  pauseActiveVideo();
  rackV3.panelMode = false;
  els.stage.innerHTML = '';
  els.reader.hidden = true;
  document.body.classList.remove('reader-open', 'reader-motion', 'panel-focus-open', 'reader-chrome-hidden');
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  if (location.hash.startsWith('#/read/')) history.replaceState(null, '', `${location.pathname}${location.search}#/`);
  renderContinue();
  renderFeatured();
  renderLibrary();
};

updateModeButton = function updateModeButtonV3() {
  if (!els.modeBtn) return;
  const physical = state.readerMode === 'book';
  els.modeBtn.textContent = physical ? '◩' : '▥';
  els.modeBtn.title = physical ? 'Physical page mode — curl and turn pages' : 'Flat page mode';
  els.modeBtn.setAttribute('aria-label', physical ? 'Switch to flat page mode' : 'Switch to physical page mode');
  els.modeBtn.setAttribute('aria-pressed', physical ? 'true' : 'false');
};

renderItem = function renderItemV3() {
  if (!state.book) return;
  if (rackV3.panelMode) return renderPanelFocus();
  if (state.readerMode === 'book') return renderPhysicalBook();
  return renderFlatPage();
};

moveSegment = function moveSegmentV3(delta) {
  if (rackV3.panelMode) return advancePanel(delta);
  if (state.readerMode === 'book' && rackV3.pageFlip) {
    if (delta < 0) rackV3.pageFlip.flipPrev('top');
    else rackV3.pageFlip.flipNext('top');
    return;
  }
  const next = Math.max(0, Math.min(state.book.sequence.length - 1, state.index + delta));
  if (next !== state.index) {
    state.index = next;
    renderItem();
  }
};

// v2 already owns the mode button click; persist its new physical/flat meaning here.
els.modeBtn?.addEventListener('click', () => {
  localStorage.setItem(MODE_KEY, state.readerMode);
  rackV3.panelMode = false;
  panelBtn?.setAttribute('aria-pressed', 'false');
});

panelBtn?.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (rackV3.panelMode) exitPanelFocus();
  else enterPanelFocus();
});

// In Panel Focus, a normal artwork tap advances regardless of which third was touched.
els.stage?.addEventListener('click', (event) => {
  if (!rackV3.panelMode || event.target.closest('button,video,a,.end-card')) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  advancePanel(1);
}, true);

function scheduleV3Reflow() {
  clearTimeout(rackV3.resizeTimer);
  rackV3.resizeTimer = setTimeout(() => {
    if (els.reader?.hidden) return;
    if (rackV3.panelMode) {
      const stage = els.stage.querySelector('.panel-focus-stage');
      const img = els.stage.querySelector('.panel-focus-image');
      const region = rackV3.panelRegions[rackV3.panelIndex];
      if (stage && img && region) focusTransform(stage, img, region);
    } else if (state.readerMode === 'book') renderPhysicalBook();
  }, 180);
}
window.addEventListener('orientationchange', scheduleV3Reflow);
window.visualViewport?.addEventListener('resize', scheduleV3Reflow);
document.addEventListener('fullscreenchange', scheduleV3Reflow);

// Let the artwork own the phone screen; controls return on interaction.
let chromeTimer = null;
function revealChrome() {
  if (els.reader?.hidden) return;
  document.body.classList.remove('reader-chrome-hidden');
  clearTimeout(chromeTimer);
  chromeTimer = setTimeout(() => {
    if (!rackV3.panelMode && !els.reader?.hidden) document.body.classList.add('reader-chrome-hidden');
  }, 2600);
}
['pointerdown', 'keydown', 'touchstart'].forEach((name) => window.addEventListener(name, revealChrome, { passive: true }));

updateModeButton();
