'use strict';

/** Input arbitration for Reader v3. Keeps StPageFlip drag physics while preventing v2 click navigation from double-turning a page. */
let rackPointerStart = null;
let rackDragged = false;

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

  // Stop the older v2 stage-click listener. If this was a drag, PageFlip already handled it.
  event.stopImmediatePropagation();
  if (rackDragged) return;

  const rect = els.stage.getBoundingClientRect();
  const x = event.clientX - rect.left;
  if (x < rect.width * .34) rackV3.pageFlip?.flipPrev('top');
  else if (x > rect.width * .66) rackV3.pageFlip?.flipNext('top');
  else {
    document.body.classList.toggle('reader-chrome-hidden');
  }
}, true);
