'use strict';

const state = {
  manifest: null,
  pageFlip: null,
  paperEnabled: true,
  resizeTimer: null,
  viewport: null,
  reflowToken: 0,
  bounds: null,
};

const els = {
  app: document.querySelector('#readerApp'),
  book: document.querySelector('#book'),
  stage: document.querySelector('#bookStage'),
  title: document.querySelector('#publicationTitle'),
  meta: document.querySelector('#publicationMeta'),
  status: document.querySelector('#pageStatus'),
  progress: document.querySelector('#progressBar'),
  previous: document.querySelector('#previousButton'),
  next: document.querySelector('#nextButton'),
  paper: document.querySelector('#paperToggle'),
  fullscreen: document.querySelector('#fullscreenButton'),
  leftStack: document.querySelector('#leftStack'),
  rightStack: document.querySelector('#rightStack'),
  error: document.querySelector('#errorPanel'),
  spine: null,
};

const COVER_ROLES = new Set(['front-cover', 'inside-front', 'inside-back', 'back-cover']);

function manifestUrl() {
  const params = new URLSearchParams(location.search);
  return params.get('manifest') || 'publication.example.json';
}

function fail(message, detail = '') {
  console.error(message, detail);
  els.error.hidden = false;
  els.error.innerHTML = `<strong>${escapeHtml(message)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ''}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function validateManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object') errors.push('manifest must be an object');
  if (!manifest?.id) errors.push('id is required');
  if (!manifest?.title) errors.push('title is required');
  if (!Array.isArray(manifest?.pages) || manifest.pages.length < 2) errors.push('pages must contain at least two items');

  (manifest?.pages || []).forEach((page, index) => {
    if (!['image', 'html'].includes(page?.type)) errors.push(`pages[${index}].type must be image or html in v0`);
    if (page?.type === 'image' && !page.src) errors.push(`pages[${index}].src is required for image pages`);
    if (page?.type === 'html' && !page.html) errors.push(`pages[${index}].html is required for html pages`);
    if (page?.fit && !['cover', 'contain'].includes(page.fit)) {
      errors.push(`pages[${index}].fit must be cover or contain`);
    }
    if (page?.edgeFill && !['none', 'soft'].includes(page.edgeFill)) {
      errors.push(`pages[${index}].edgeFill must be none or soft`);
    }
    if (page?.turn && !['flexible', 'rigid'].includes(page.turn)) {
      errors.push(`pages[${index}].turn must be flexible or rigid`);
    }
  });

  if (errors.length) throw new Error(errors.join('; '));
  return manifest;
}

async function loadManifest() {
  const response = await fetch(manifestUrl(), { cache: 'no-store' });
  if (!response.ok) throw new Error(`Manifest returned HTTP ${response.status}`);
  return validateManifest(await response.json());
}

function applyPhysicalProfile(manifest) {
  const physical = manifest.physical || {};
  const paper = physical.paper || {};
  const root = document.documentElement;
  if (paper.color) root.style.setProperty('--paper', paper.color);
  if (paper.edgeColor) root.style.setProperty('--paper-edge', paper.edgeColor);
  if (Number.isFinite(paper.textureOpacity)) {
    root.style.setProperty('--texture-opacity', String(Math.max(0, Math.min(0.5, paper.textureOpacity))));
  }
}

function isCoverStock(page) {
  return COVER_ROLES.has(String(page?.role || '').toLowerCase());
}

function usesRigidPhysics(page) {
  // `turn` controls deformation. The legacy `hard` flag remains supported,
  // but visual cover stock no longer implies rigid StPageFlip physics.
  if (page?.turn) return page.turn === 'rigid';
  return page?.hard === true;
}

function ensureSpine() {
  if (els.spine?.isConnected) return els.spine;
  const spine = document.createElement('div');
  spine.id = 'vesperaSpine';
  spine.className = 'vespera-spine';
  spine.setAttribute('aria-hidden', 'true');
  els.stage.append(spine);
  els.spine = spine;
  return spine;
}

function installStockStyles() {
  if (document.querySelector('#vesperaStockStyles')) return;
  const style = document.createElement('style');
  style.id = 'vesperaStockStyles';
  style.textContent = `
    .vp-page[data-stock="cover"] {
      --texture-opacity: .11;
      box-shadow: 0 11px 36px rgba(0,0,0,.28), inset 0 0 0 1px rgba(255,255,255,.18);
    }

    /* In portrait the engine always displays the current sheet as the right-hand
       page. Keep the gutter on its left inner edge instead of alternating with
       print parity, otherwise the binding appears to jump from side to side. */
    .book-stage[data-reader-orientation="portrait"] .vp-page {
      --gutter-x: 19px !important;
      --gutter-gradient: linear-gradient(to left, transparent 80%, rgba(37,27,18,.045) 90%, rgba(30,20,12,.24) 100%) !important;
    }

    .vespera-spine {
      position: absolute;
      z-index: 3;
      width: var(--vespera-spine-width, 8px);
      height: var(--vespera-spine-height, 100px);
      left: var(--vespera-spine-x, 50%);
      top: var(--vespera-spine-y, 50%);
      pointer-events: none;
      opacity: 0;
      transform: translate(-100%, 0);
      border-radius: 3px 0 0 3px;
      background:
        linear-gradient(to right, rgba(55,38,22,.62), rgba(105,78,48,.24) 32%, rgba(232,218,197,.88) 74%, rgba(248,239,224,.96)),
        repeating-linear-gradient(to bottom, rgba(75,55,34,.20) 0 1px, rgba(244,233,216,.90) 1px 3px);
      box-shadow:
        -4px 7px 18px rgba(0,0,0,.18),
        inset -1px 0 rgba(255,255,255,.36),
        5px 0 12px -8px rgba(20,13,7,.92);
      transition: opacity 120ms ease, width 160ms ease;
    }

    .book-stage[data-reader-orientation="portrait"] .vespera-spine {
      opacity: .94;
    }
  `;
  document.head.append(style);
}

function createSoftEdgeFill(src, position) {
  const bleed = document.createElement('div');
  bleed.className = 'vp-page__edge-fill';
  bleed.setAttribute('aria-hidden', 'true');
  Object.assign(bleed.style, {
    position: 'absolute',
    zIndex: '1',
    inset: '0',
    pointerEvents: 'none',
    backgroundImage: `url(${JSON.stringify(src)})`,
    backgroundSize: 'cover',
    backgroundPosition: position,
    backgroundRepeat: 'no-repeat',
    filter: 'blur(16px) saturate(.72) brightness(.84)',
    transform: 'scale(1.055)',
    transformOrigin: '50% 50%',
    opacity: '.30',
  });
  return bleed;
}

function createPage(page, index) {
  const node = document.createElement('div');
  node.className = 'vp-page';
  node.dataset.side = index % 2 === 0 ? 'right' : 'left';
  if (isCoverStock(page)) node.dataset.stock = 'cover';
  if (usesRigidPhysics(page)) node.dataset.density = 'hard';
  if (page.role) node.dataset.role = page.role;
  if (!state.paperEnabled) node.classList.add('paper-off');

  if (page.type === 'image') {
    const fit = page.fit || 'cover';
    const position = page.position || '50% 50%';
    const edgeFill = page.edgeFill || (fit === 'contain' ? 'soft' : 'none');

    if (fit === 'contain' && edgeFill === 'soft') {
      node.append(createSoftEdgeFill(page.src, position));
    }

    const img = document.createElement('img');
    img.className = 'vp-page__media';
    img.src = page.src;
    img.alt = page.alt || `${state.manifest.title}, page ${index + 1}`;
    img.draggable = false;
    img.decoding = 'async';
    img.style.objectFit = fit;
    img.style.objectPosition = position;
    if (fit === 'contain' && edgeFill === 'soft') img.style.background = 'transparent';
    node.append(img);
  } else if (page.type === 'html') {
    const content = document.createElement('article');
    content.className = 'vp-page__html';
    content.innerHTML = page.html;
    node.append(content);
  }

  const showEngineLabel = page.hideLabel !== true && (page.type === 'html' || Boolean(page.label));
  if (showEngineLabel) {
    const label = document.createElement('span');
    label.className = 'vp-page__label';
    label.textContent = page.label || String(index + 1).padStart(2, '0');
    node.append(label);
  }
  return node;
}

function buildPages(manifest) {
  const fragment = document.createDocumentFragment();
  manifest.pages.forEach((page, index) => fragment.append(createPage(page, index)));
  els.book.replaceChildren(fragment);
}

function pageRatio(manifest) {
  const width = Number(manifest.format?.width) || 900;
  const height = Number(manifest.format?.height) || 1200;
  return height / width;
}

function calculatePageBounds(manifest) {
  const ratio = pageRatio(manifest);
  const rect = els.stage.getBoundingClientRect();
  const stageWidth = Math.max(1, rect.width || window.innerWidth * 0.9);
  const stageHeight = Math.max(1, rect.height || window.innerHeight * 0.75);

  const viewportLandscape = window.innerWidth > window.innerHeight;
  const spread = viewportLandscape && stageWidth > stageHeight * 1.08 && stageWidth >= 620;
  const columns = spread ? 2 : 1;
  const gutterAllowance = spread ? 12 : 4;
  const maxByWidth = (stageWidth - gutterAllowance) / columns;
  const maxByHeight = (stageHeight - 6) / ratio;
  const fittedWidth = Math.max(80, Math.floor(Math.min(maxByWidth, maxByHeight) * 0.985));
  const fittedHeight = Math.max(100, Math.floor(fittedWidth * ratio));

  const minWidth = spread
    ? Math.min(90, fittedWidth)
    : Math.max(80, Math.min(fittedWidth, Math.floor(fittedWidth * 0.92)));
  const minHeight = Math.max(100, Math.min(fittedHeight, Math.floor(minWidth * ratio)));

  return {
    spread,
    minWidth,
    minHeight,
    maxWidth: fittedWidth,
    maxHeight: fittedHeight,
  };
}

function positionSpine(bounds, orientation = bounds.spread ? 'landscape' : 'portrait') {
  const spine = ensureSpine();
  const stageRect = els.stage.getBoundingClientRect();
  const hostWidth = Math.max(1, Math.round(bounds.maxWidth * (bounds.spread ? 2 : 1)));
  const hostHeight = Math.max(1, Math.round(bounds.maxHeight));
  const hostLeft = Math.max(0, (stageRect.width - hostWidth) / 2);
  const hostTop = Math.max(0, (stageRect.height - hostHeight) / 2);
  const portrait = orientation === 'portrait';
  const spineX = portrait ? hostLeft : stageRect.width / 2;

  els.stage.dataset.readerOrientation = orientation;
  spine.style.setProperty('--vespera-spine-x', `${spineX}px`);
  spine.style.setProperty('--vespera-spine-y', `${hostTop}px`);
  spine.style.setProperty('--vespera-spine-height', `${hostHeight}px`);
  spine.style.setProperty('--vespera-spine-width', portrait ? '8px' : '10px');
}

function lockBookHost(bounds) {
  const hostWidth = Math.max(1, Math.round(bounds.maxWidth * (bounds.spread ? 2 : 1)));
  const hostHeight = Math.max(1, Math.round(bounds.maxHeight));
  state.bounds = bounds;

  Object.assign(els.book.style, {
    width: `${hostWidth}px`,
    height: `${hostHeight}px`,
    maxWidth: `${hostWidth}px`,
    maxHeight: `${hostHeight}px`,
    position: 'relative',
    zIndex: '4',
    flex: '0 0 auto',
  });

  positionSpine(bounds);
}

function initPageFlip(manifest, initialIndex = 0) {
  if (!window.St?.PageFlip) {
    throw new Error('StPageFlip did not load from ../vendor/page-flip.browser.min.js');
  }

  const format = manifest.format || {};
  const pageWidth = Number(format.width) || 900;
  const pageHeight = Number(format.height) || 1200;
  const bounds = calculatePageBounds(manifest);
  const rigidOuterCover = usesRigidPhysics(manifest.pages[0]);

  lockBookHost(bounds);

  const pageFlip = new St.PageFlip(els.book, {
    width: pageWidth,
    height: pageHeight,
    size: 'stretch',
    minWidth: bounds.minWidth,
    maxWidth: bounds.maxWidth,
    minHeight: bounds.minHeight,
    maxHeight: bounds.maxHeight,
    maxShadowOpacity: 0.42,
    // StPageFlip's showCover mode forcibly converts the first/last sheet to
    // rigid board physics. Only enable it when the publication explicitly asks
    // for a rigid outer cover; soft comic covers should curl like paper.
    showCover: rigidOuterCover,
    mobileScrollSupport: false,
    usePortrait: true,
    autoSize: false,
    drawShadow: true,
    showPageCorners: true,
    flippingTime: 650,
    startPage: Math.max(0, Math.min(initialIndex, manifest.pages.length - 1)),
  });

  state.pageFlip = pageFlip;

  pageFlip.on('init', () => {
    if (state.pageFlip !== pageFlip) return;
    els.app.classList.remove('is-reflowing');
    updateReaderState();
  });
  pageFlip.on('flip', updateReaderState);
  pageFlip.on('changeOrientation', () => {
    if (state.pageFlip !== pageFlip) return;
    updateReaderState();
  });
  pageFlip.on('changeState', () => requestAnimationFrame(updateReaderState));

  pageFlip.loadFromHTML(document.querySelectorAll('.vp-page'));
}

function currentIndex() {
  if (!state.pageFlip) return 0;
  return Math.max(0, state.pageFlip.getCurrentPageIndex?.() || 0);
}

function currentOrientation() {
  return state.pageFlip?.getOrientation?.() || 'portrait';
}

function updateReaderState() {
  if (!state.manifest || !state.pageFlip) return;
  const total = state.manifest.pages.length;
  const index = Math.min(currentIndex(), total - 1);
  const progress = total <= 1 ? 1 : index / (total - 1);
  const orientation = currentOrientation();
  const canShowSpread = orientation === 'landscape' && index >= 0 && index < total - 1;
  const endIndex = Math.min(total - 1, index + 1);

  if (state.bounds) positionSpine(state.bounds, orientation);

  els.status.textContent = canShowSpread && endIndex > index
    ? `Pages ${index + 1}–${endIndex + 1} of ${total}`
    : `Page ${index + 1} of ${total}`;
  els.progress.style.width = `${Math.max(2, ((index + 1) / total) * 100)}%`;
  els.previous.disabled = index <= 0;
  els.next.disabled = index >= total - 1;

  const maxDepth = 11;
  const minDepth = 1.5;
  const leftDepth = minDepth + maxDepth * progress;
  const rightDepth = minDepth + maxDepth * (1 - progress);
  els.leftStack.style.setProperty('--stack-depth', `${leftDepth.toFixed(1)}px`);
  els.rightStack.style.setProperty('--stack-depth', `${rightDepth.toFixed(1)}px`);
  els.leftStack.style.setProperty('--stack-opacity', String(0.24 + 0.62 * progress));
  els.rightStack.style.setProperty('--stack-opacity', String(0.24 + 0.62 * (1 - progress)));

  if (els.spine) {
    const portraitDepth = 5 + 5 * progress;
    els.spine.style.setProperty('--vespera-spine-width', orientation === 'portrait' ? `${portraitDepth.toFixed(1)}px` : '10px');
  }
}

function togglePaper() {
  state.paperEnabled = !state.paperEnabled;
  els.paper.setAttribute('aria-pressed', String(state.paperEnabled));
  document.querySelectorAll('.vp-page').forEach((page) => {
    page.classList.toggle('paper-off', !state.paperEnabled);
  });
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await els.app.requestFullscreen();
  } catch (error) {
    console.warn('Fullscreen unavailable', error);
  }
}

function replaceBookHost() {
  const replacement = document.createElement('div');
  replacement.id = 'book';

  if (els.book?.isConnected) {
    els.book.replaceWith(replacement);
  } else {
    els.stage.append(replacement);
  }

  els.book = replacement;
}

function reflowReader() {
  if (!state.manifest) return;

  const index = currentIndex();
  const token = ++state.reflowToken;
  els.app.classList.add('is-reflowing');
  els.previous.disabled = true;
  els.next.disabled = true;

  try {
    state.pageFlip?.destroy?.();
  } catch (error) {
    console.warn('PageFlip destroy during reflow failed', error);
  }

  state.pageFlip = null;

  replaceBookHost();
  buildPages(state.manifest);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (token !== state.reflowToken) return;
      initPageFlip(state.manifest, index);
      state.viewport = { width: window.innerWidth, height: window.innerHeight };
    });
  });
}

function scheduleReflow(force = false) {
  window.clearTimeout(state.resizeTimer);
  state.resizeTimer = window.setTimeout(() => {
    const previous = state.viewport || { width: window.innerWidth, height: window.innerHeight };
    const next = { width: window.innerWidth, height: window.innerHeight };
    const orientationChanged = (previous.width > previous.height) !== (next.width > next.height);
    const widthChanged = Math.abs(previous.width - next.width) > 72;

    if (force || orientationChanged || widthChanged) {
      reflowReader();
    }
  }, 260);
}

function bindControls() {
  els.previous.addEventListener('click', () => state.pageFlip?.flipPrev('top'));
  els.next.addEventListener('click', () => state.pageFlip?.flipNext('top'));
  els.paper.addEventListener('click', togglePaper);
  els.fullscreen.addEventListener('click', toggleFullscreen);

  window.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault();
      state.pageFlip?.flipPrev('top');
    }
    if (event.key === 'ArrowRight' || event.key === 'PageDown') {
      event.preventDefault();
      state.pageFlip?.flipNext('top');
    }
  });

  window.addEventListener('resize', () => scheduleReflow(false));
  window.addEventListener('orientationchange', () => scheduleReflow(true));
  document.addEventListener('fullscreenchange', () => scheduleReflow(true));
}

async function start() {
  try {
    state.manifest = await loadManifest();
    installStockStyles();
    ensureSpine();
    applyPhysicalProfile(state.manifest);
    els.title.textContent = state.manifest.title;
    els.meta.textContent = [state.manifest.series, state.manifest.publisher].filter(Boolean).join(' · ') || 'Vespera Publication Engine · v0';
    document.title = `${state.manifest.title} — Vespera Publication Engine`;
    buildPages(state.manifest);
    state.viewport = { width: window.innerWidth, height: window.innerHeight };
    initPageFlip(state.manifest);
    bindControls();
  } catch (error) {
    fail('The publication could not be opened.', error.message || String(error));
  }
}

start();