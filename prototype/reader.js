'use strict';

const state = {
  manifest: null,
  pageFlip: null,
  paperEnabled: true,
  resizeTimer: null,
  viewport: null,
  reflowToken: 0,
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
};

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

function usesCoverStock(page) {
  if (page?.hard) return true;
  const role = String(page?.role || '').toLowerCase();
  return ['front-cover', 'inside-front', 'inside-back', 'back-cover'].includes(role);
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
  if (usesCoverStock(page)) node.dataset.density = 'hard';
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

  // Image publications often already print page numbers into the artwork.
  // Keep engine labels for HTML pages or when a publication explicitly asks for one.
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

  // Reader policy: portrait viewport = one page. A spread is only allowed
  // when the viewport itself is landscape and the stage has useful horizontal room.
  const viewportLandscape = window.innerWidth > window.innerHeight;
  const spread = viewportLandscape && stageWidth > stageHeight * 1.08 && stageWidth >= 620;
  const columns = spread ? 2 : 1;
  const gutterAllowance = spread ? 12 : 4;
  const maxByWidth = (stageWidth - gutterAllowance) / columns;
  const maxByHeight = (stageHeight - 6) / ratio;
  const fittedWidth = Math.max(80, Math.floor(Math.min(maxByWidth, maxByHeight) * 0.985));
  const fittedHeight = Math.max(100, Math.floor(fittedWidth * ratio));

  // StPageFlip switches to portrait only when blockWidth < minWidth * 2.
  // For single-page mode, keep minWidth near the fitted page width so the
  // library deterministically chooses portrait instead of guessing landscape.
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

function initPageFlip(manifest, initialIndex = 0) {
  if (!window.St?.PageFlip) {
    throw new Error('StPageFlip did not load from ../vendor/page-flip.browser.min.js');
  }

  const format = manifest.format || {};
  const pageWidth = Number(format.width) || 900;
  const pageHeight = Number(format.height) || 1200;
  const bounds = calculatePageBounds(manifest);

  const pageFlip = new St.PageFlip(els.book, {
    width: pageWidth,
    height: pageHeight,
    size: 'stretch',
    minWidth: bounds.minWidth,
    maxWidth: bounds.maxWidth,
    minHeight: bounds.minHeight,
    maxHeight: bounds.maxHeight,
    maxShadowOpacity: 0.42,
    showCover: true,
    mobileScrollSupport: false,
    usePortrait: true,
    autoSize: true,
    drawShadow: true,
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
  pageFlip.on('changeOrientation', updateReaderState);
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
  const canShowSpread = orientation === 'landscape' && index > 0 && index < total - 1;
  const endIndex = Math.min(total - 1, index + 1);

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

  // PageFlip mutates its host with wrappers, classes and inline sizing.
  // Always replace the host so a new orientation starts from clean geometry.
  replaceBookHost();
  buildPages(state.manifest);

  // Android browser chrome/orientation changes can report an intermediate
  // viewport for a frame or two. Wait two frames before measuring the stage.
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
