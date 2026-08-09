'use strict';

/**
 * The Rack — comic shelf + sequential reader (flat stage).
 * Page-flip temporarily disabled — images/videos render directly.
 */

const state = { data: null, book: null, index: 0 };

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

function openBook(id, index = 0) {
  const book = state.data.books.find((b) => b.id === id);
  if (!book) return;
  state.book = book;
  state.index = Math.max(0, Math.min(index, book.sequence.length - 1));
  location.hash = `#/read/${encodeURIComponent(id)}/${state.index + 1}`;
  showReader();
}

function showReader() {
  document.body.style.overflow = 'hidden';
  els.reader.hidden = false;
  els.title.textContent = state.book.title;
  renderThumbs();
  renderItem();
  els.reader.focus?.();
}

function closeReader() {
  els.stage.innerHTML = '';
  els.reader.hidden = true;
  document.body.style.overflow = '';
  location.hash = '#/';
}

function renderThumbs() {
  els.rail.innerHTML = '';
  state.book.sequence.forEach((item, i) => {
    const b = document.createElement('button');
    const isVideo = item.type === 'video';
    b.className = 'thumb' + (i === state.index ? ' active' : '') + (isVideo ? ' thumb--motion' : '');
    b.setAttribute(
      'aria-label',
      isVideo
        ? `Motion moment ${i + 1}${item.caption ? `: ${item.caption}` : ''}`
        : `Go to page ${i + 1}`,
    );
    if (isVideo) {
      const v = document.createElement('div');
      v.className = 'video-thumb';
      if (item.poster) {
        const img = document.createElement('img');
        img.src = item.poster;
        img.alt = '';
        img.className = 'video-thumb__poster';
        v.append(img);
      }
      const badge = document.createElement('span');
      badge.className = 'video-thumb__badge';
      badge.textContent = 'MOTION';
      v.append(badge);
      const play = document.createElement('span');
      play.className = 'video-thumb__play';
      play.textContent = '▶';
      v.append(play);
      b.append(v);
    } else {
      const img = document.createElement('img');
      img.src = item.src;
      img.alt = '';
      b.append(img);
    }
    const n = document.createElement('span');
    n.className = 'thumb__num';
    n.textContent = i + 1;
    b.append(n);
    b.onclick = () => goTo(i);
    els.rail.append(b);
  });
}

function renderItem() {
  const item = state.book.sequence[state.index];
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

  els.position.textContent = `${state.index + 1} / ${state.book.sequence.length}`;
  els.progress.style.width = `${((state.index + 1) / state.book.sequence.length) * 100}%`;
  els.prev.disabled = state.index === 0;
  els.next.disabled = state.index === state.book.sequence.length - 1;
  [...els.rail.children].forEach((x, i) => x.classList.toggle('active', i === state.index));
  els.rail.children[state.index]?.scrollIntoView({ block: 'nearest' });
  history.replaceState(
    null,
    '',
    `#/read/${encodeURIComponent(state.book.id)}/${state.index + 1}`,
  );
}

function goTo(i) {
  if (!state.book || i < 0 || i >= state.book.sequence.length) return;
  state.index = i;
  renderItem();
}

function route() {
  const p = location.hash.match(/^#\/read\/([^/]+)\/(\d+)/);
  if (p) {
    const b = state.data.books.find((x) => x.id === decodeURIComponent(p[1]));
    if (b) {
      state.book = b;
      state.index = Math.min(Math.max(Number(p[2]) - 1, 0), b.sequence.length - 1);
      showReader();
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

let touchX = 0;
els.stage.addEventListener(
  'touchstart',
  (e) => {
    touchX = e.changedTouches[0].clientX;
  },
  { passive: true },
);
els.stage.addEventListener(
  'touchend',
  (e) => {
    const d = e.changedTouches[0].clientX - touchX;
    if (Math.abs(d) > 55) goTo(state.index + (d < 0 ? 1 : -1));
  },
  { passive: true },
);

loadRack();
