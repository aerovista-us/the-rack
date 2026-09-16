'use strict';

/**
 * The Rack Reader v3 — exact viewport-fit production override.
 * Promoted from prototype/viewport-fit.js (Vespera v0.4.6).
 *
 * StPageFlip's `size: stretch` performs a second sizing pass after The Rack
 * has already calculated a fitted page size. On short/wide viewports that can
 * make a spread taller than the visible stage and clip the bottom of pages.
 * This override gives PageFlip the final physical page dimensions directly.
 */
(() => {
  const EDGE_SAFETY = 4;
  const MIN_SPREAD_PAGE_WIDTH = 320;

  function stageSize() {
    const viewport = viewportSize();
    const rect = els.stage.getBoundingClientRect();
    return {
      width: Math.max(1, Math.floor(rect.width || viewport.width)),
      height: Math.max(1, Math.floor(rect.height || viewport.height)),
    };
  }

  pageBounds = function exactViewportPageBounds(format) {
    const stage = stageSize();
    const ratio = Math.max(.2, Number(format.height) / Math.max(1, Number(format.width)));
    const viewport = viewportSize();
    const requested = String(state.book?.spreadMode || 'auto').toLowerCase();
    const usableWidth = Math.max(1, stage.width - EDGE_SAFETY * 2);
    const usableHeight = Math.max(1, stage.height - EDGE_SAFETY * 2);
    const spreadWidth = Math.floor(Math.min(usableWidth / 2, usableHeight / ratio));

    const autoSpread = viewport.width > viewport.height
      && stage.width >= 720
      && stage.width / stage.height > 1.08
      && spreadWidth >= MIN_SPREAD_PAGE_WIDTH;

    const spread = requested === 'single'
      ? false
      : requested === 'spread'
        ? true
        : autoSpread;

    const columns = spread ? 2 : 1;
    const fittedWidth = Math.max(80, Math.floor(Math.min(usableWidth / columns, usableHeight / ratio)));
    const fittedHeight = Math.max(100, Math.floor(fittedWidth * ratio));
    return { spread, width: fittedWidth, height: fittedHeight };
  };

  renderPhysicalBook = async function renderPhysicalBookExactFit() {
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
    const columns = bounds.spread ? 2 : 1;
    const hostWidth = Math.max(1, Math.round(bounds.width * columns));
    const hostHeight = Math.max(1, Math.round(bounds.height));
    const host = document.createElement('div');
    host.id = 'rackPhysicalBook';
    host.className = 'rack-physical-book';
    Object.assign(host.style, {
      width: `${hostWidth}px`,
      height: `${hostHeight}px`,
      minWidth: `${hostWidth}px`,
      minHeight: `${hostHeight}px`,
      maxWidth: `${hostWidth}px`,
      maxHeight: `${hostHeight}px`,
      margin: '0',
      padding: '0',
    });
    els.stage.append(host);
    state.book.sequence.forEach((item, i) => host.append(makePaperPage(item, i)));

    const flip = new St.PageFlip(host, {
      width: bounds.width,
      height: bounds.height,
      size: 'fixed',
      maxShadowOpacity: .58,
      showCover: false,
      mobileScrollSupport: false,
      usePortrait: !bounds.spread,
      autoSize: false,
      drawShadow: true,
      showPageCorners: true,
      flippingTime: matchMedia('(prefers-reduced-motion: reduce)').matches ? 180 : 720,
      startPage: Math.max(0, Math.min(state.index, state.book.sequence.length - 1)),
    });

    rackV3.pageFlip = flip;
    flip.on('init', () => {
      if (rackV3.pageFlip !== flip) return;
      syncChrome(flip.getCurrentPageIndex?.() ?? state.index);
      requestAnimationFrame(() => {
        const stageRect = els.stage.getBoundingClientRect();
        const hostRect = host.getBoundingClientRect();
        const overflowX = hostRect.width - stageRect.width;
        const overflowY = hostRect.height - stageRect.height;
        if (overflowX > 2 || overflowY > 2) {
          console.warn('Reader fit guard: physical book overflow detected', { overflowX, overflowY, bounds });
          state.readerMode = 'focus';
          updateModeButton();
          renderFlatPage();
        }
      });
    });
    flip.on('flip', (event) => syncChrome(Number(event?.data ?? flip.getCurrentPageIndex?.() ?? state.index)));
    flip.loadFromHTML(host.querySelectorAll('.rack-paper-page'));
    els.stage.dataset.pageOrientation = bounds.spread ? 'spread' : 'portrait';
    syncChrome(state.index);
  };
})();
