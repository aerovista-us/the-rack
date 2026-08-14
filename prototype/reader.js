'use strict';

const state = {
  manifest: null,
  pageFlip: null,
  paperEnabled: true,
};

const els = {
  app: document.querySelector('#readerApp'),
  book: document.querySelector('#book'),
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

function createPage(page, index) {
  const node = document.createElement('div');
  node.className = 'vp-page';
  node.dataset.side = index % 2 === 0 ? 'right' : 'left';
  if (page.hard || /cover/i.test(page.role || '')) node.dataset.density = 'hard';
  if (page.role) node.dataset.role = page.role;

  if (page.type === 'image') {
    const img = document.createElement('img');
    img.className = 'vp-page__media';
    img.src = page.src;
    img.alt = page.alt || `${state.manifest.title}, page ${index + 1}`;
    img.draggable = false;
    img.decoding = 'async';
    node.append(img);
  } else if (page.type === 'html') {
    const content = document.createElement('article');
    content.className = 'vp-page__html';
    content.innerHTML = page.html;
    node.append(content);
  }

  if (!page.hideLabel) {
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

function initPageFlip(manifest) {
  if (!window.St?.PageFlip) {
    throw new Error('StPageFlip did not load from ../vendor/page-flip.browser.min.js');
  }

  const format = manifest.format || {};
  const pageWidth = Number(format.width) || 900;
  const pageHeight = Number(format.height) || 1200;
  const ratio = pageHeight / pageWidth;

  state.pageFlip = new St.PageFlip(els.book, {
    width: pageWidth,
    height: pageHeight,
    size: 'stretch',
    minWidth: 280,
    maxWidth: 900,
    minHeight: Math.round(280 * ratio),
    maxHeight: 1200,
    maxShadowOpacity: 0.42,
    showCover: true,
    mobileScrollSupport: false,
    usePortrait: true,
    autoSize: true,
    drawShadow: true,
    flippingTime: 650,
  });

  state.pageFlip.loadFromHTML(document.querySelectorAll('.vp-page'));
  state.pageFlip.on('flip', updateReaderState);
  state.pageFlip.on('changeOrientation', updateReaderState);
  state.pageFlip.on('changeState', () => requestAnimationFrame(updateReaderState));
}

function currentIndex() {
  if (!state.pageFlip) return 0;
  return Math.max(0, state.pageFlip.getCurrentPageIndex?.() || 0);
}

function updateReaderState() {
  if (!state.manifest || !state.pageFlip) return;
  const total = state.manifest.pages.length;
  const index = Math.min(currentIndex(), total - 1);
  const progress = total <= 1 ? 1 : index / (total - 1);

  els.status.textContent = `Page ${index + 1} of ${total}`;
  els.progress.style.width = `${Math.max(2, ((index + 1) / total) * 100)}%`;
  els.previous.disabled = index <= 0;
  els.next.disabled = index >= total - 1;

  const maxDepth = 13;
  const minDepth = 2;
  const leftDepth = minDepth + maxDepth * progress;
  const rightDepth = minDepth + maxDepth * (1 - progress);
  els.leftStack.style.setProperty('--stack-depth', `${leftDepth.toFixed(1)}px`);
  els.rightStack.style.setProperty('--stack-depth', `${rightDepth.toFixed(1)}px`);
  els.leftStack.style.setProperty('--stack-opacity', String(0.28 + 0.7 * progress));
  els.rightStack.style.setProperty('--stack-opacity', String(0.28 + 0.7 * (1 - progress)));
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
}

async function start() {
  try {
    state.manifest = await loadManifest();
    applyPhysicalProfile(state.manifest);
    els.title.textContent = state.manifest.title;
    els.meta.textContent = [state.manifest.series, state.manifest.publisher].filter(Boolean).join(' · ') || 'Vespera Publication Engine · v0';
    document.title = `${state.manifest.title} — Vespera Publication Engine`;
    buildPages(state.manifest);
    initPageFlip(state.manifest);
    bindControls();
    requestAnimationFrame(updateReaderState);
  } catch (error) {
    fail('The publication could not be opened.', error.message || String(error));
  }
}

start();
