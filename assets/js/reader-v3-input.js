'use strict';

/** Input arbitration for Reader v3. Keeps StPageFlip drag physics while preventing v2 click navigation from double-turning a page. */
let rackPointerStart = null;
let rackDragged = false;

// The Rack always presents one physical comic page at a time.
pageBounds = function singlePageBounds(format) {
  const viewport = viewportSize();
  const rect = els.stage.getBoundingClientRect();
  const width = Math.max(1, rect.width || viewport.width);
  const height = Math.max(1, rect.height || viewport.height);
  const ratio = Math.max(.2, Number(format.height) / Math.max(1, Number(format.width)));
  const edge = width < 600 ? 3 : 12;
  const fitW = Math.floor(Math.min(width - edge * 2, (height - edge * 2) / ratio));
  return { spread: false, width: Math.max(80, fitW), height: Math.max(100, Math.floor(fitW * ratio)) };
};

els.stage?.addEventListener('pointerdown', (event) => {
  if (rackV3.panelMode || state.readerMode !== 'book' || !event.target.closest('.rack-physical-book')) return;
  rackPointerStart = { x: event.clientX, y: event.clientY };
  rackDragged = false;
}, true);

els.stage?.addEventListener('pointermove', (event) => {
  if (!rackPointerStart) return;
  const dx = event.clientX - rackPointerStart.x;
  const dy = event.clientY - rackPointerStart.y;
  if (Math.hypot(dx, dy) > 14) rackDragged = true;
}, true);

els.stage?.addEventListener('pointerup', () => {
  if (!rackPointerStart) return;
  setTimeout(() => { rackPointerStart = null; rackDragged = false; }, 0);
}, true);

els.stage?.addEventListener('click', (event) => {
  if (rackV3.panelMode || state.readerMode !== 'book') return;
  if (!event.target.closest('.rack-physical-book')) return;
  if (event.target.closest('video,button,a,input')) return;
  event.stopImmediatePropagation();
  if (rackDragged) return;
  const rect = els.stage.getBoundingClientRect();
  const x = event.clientX - rect.left;
  if (x < rect.width * .34) rackV3.pageFlip?.flipPrev('top');
  else if (x > rect.width * .66) rackV3.pageFlip?.flipNext('top');
  else document.body.classList.toggle('reader-chrome-hidden');
}, true);

/**
 * Optional cross-media companion support.
 * Book metadata can declare:
 *   companionUrl: "https://..."
 *   companionLabel: "Listen to the EchoStory"
 * This keeps The Rack a comic reader while making connected audio experiences
 * first-class and discoverable from shelf, reader, and end card.
 */
function rackCompanionLink(book, label, className = 'secondary-button', source = 'rack') {
  if (!book?.companionUrl) return null;
  const link = document.createElement('a');
  link.href = book.companionUrl;
  link.target = '_blank';
  link.rel = 'noopener';
  link.className = className;
  link.textContent = label || book.companionLabel || 'Open companion';
  link.addEventListener('click', () => track('companion_open', { book: book.id, source }));
  return link;
}

const rackRenderFeatured = renderFeatured;
renderFeatured = function renderFeaturedWithCompanion() {
  rackRenderFeatured();
  const book = state.data?.books?.find((item) => item.featured) || state.data?.books?.[0];
  const actions = els.featured?.querySelector('.featured-actions');
  if (!book?.companionUrl || !actions || actions.querySelector('[data-companion-link]')) return;
  const link = rackCompanionLink(book, book.companionLabel || 'Listen / Player', 'secondary-button', 'featured');
  if (!link) return;
  link.dataset.companionLink = 'true';
  actions.append(link);
};

const rackCreateBookCard = createBookCard;
createBookCard = function createBookCardWithCompanion(book) {
  const article = rackCreateBookCard(book);
  if (!book?.companionUrl) return article;
  const actions = article.querySelector('.book-actions');
  if (!actions) return article;
  const link = rackCompanionLink(book, book.companionShortLabel || 'Listen', 'secondary-button', 'card');
  if (link) actions.insertBefore(link, actions.querySelector('.item-count'));
  return article;
};

const rackRenderEndCard = renderEndCard;
renderEndCard = function renderEndCardWithCompanion() {
  rackRenderEndCard();
  if (!state.book?.companionUrl) return;
  const actions = els.stage.querySelector('.end-card > div');
  if (!actions || actions.querySelector('[data-companion-link]')) return;
  const link = rackCompanionLink(state.book, state.book.companionLabel || 'Listen to the story', 'secondary-button', 'end_card');
  if (!link) return;
  link.dataset.companionLink = 'true';
  actions.prepend(link);
};

function syncReaderCompanion() {
  const tools = document.querySelector('.reader-tools');
  if (!tools) return;
  tools.querySelector('[data-reader-companion]')?.remove();
  if (!state.book?.companionUrl || els.reader?.hidden) return;
  const link = rackCompanionLink(state.book, '♫', 'icon-button', 'reader_header');
  if (!link) return;
  link.dataset.readerCompanion = 'true';
  link.setAttribute('aria-label', state.book.companionLabel || 'Open companion player');
  link.title = state.book.companionLabel || 'Open companion player';
  tools.insertBefore(link, tools.firstChild);
}

const rackShowReader = showReader;
showReader = function showReaderWithCompanion() {
  rackShowReader();
  syncReaderCompanion();
};

const rackCloseReader = closeReader;
closeReader = function closeReaderWithCompanion() {
  rackCloseReader();
  document.querySelector('[data-reader-companion]')?.remove();
};

if (state.data) renderAll();
if (state.data && state.book && !els.reader?.hidden) showReader();
