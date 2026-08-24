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

if (state.data && state.book && !els.reader?.hidden) showReader();
