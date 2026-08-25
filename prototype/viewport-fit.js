'use strict';

/* v0.4.6 — exact viewport-fit integration for StPageFlip.
   reader.js remains the reusable engine; this layer replaces only the sizing
   contract so a page/spread occupies the maximum physical area the current
   workspace can contain without cropping or internal center slack. */

(() => {
  const EDGE_SAFETY = 2;

  function getStageSize() {
    const rect = els.stage.getBoundingClientRect();
    return {
      width: Math.max(1, Math.floor(rect.width || window.innerWidth)),
      height: Math.max(1, Math.floor(rect.height || window.innerHeight)),
    };
  }

  calculatePageBounds = function viewportPageBounds(manifest) {
    const ratio = pageRatio(manifest);
    const stage = getStageSize();
    const viewportLandscape = window.innerWidth > window.innerHeight;

    // Landscape uses an actual two-page spread only when there is enough width
    // for two useful sheets. Portrait always protects one large reading page.
    const spread = viewportLandscape && stage.width >= 560;
    const columns = spread ? 2 : 1;

    const usableWidth = Math.max(1, stage.width - EDGE_SAFETY * 2);
    const usableHeight = Math.max(1, stage.height - EDGE_SAFETY * 2);
    const widthFromViewport = usableWidth / columns;
    const widthFromHeight = usableHeight / ratio;

    const fittedWidth = Math.max(80, Math.floor(Math.min(widthFromViewport, widthFromHeight)));
    const fittedHeight = Math.max(100, Math.floor(fittedWidth * ratio));

    return {
      spread,
      minWidth: fittedWidth,
      maxWidth: fittedWidth,
      minHeight: fittedHeight,
      maxHeight: fittedHeight,
    };
  };

  positionSpine = function viewportPositionSpine(bounds, orientation = bounds.spread ? 'landscape' : 'portrait') {
    const spine = ensureSpine();
    const stageRect = els.stage.getBoundingClientRect();
    const columns = bounds.spread ? 2 : 1;
    const hostWidth = Math.max(1, Math.round(bounds.maxWidth * columns));
    const hostHeight = Math.max(1, Math.round(bounds.maxHeight));
    const hostLeft = Math.max(0, (stageRect.width - hostWidth) / 2);
    const hostTop = Math.max(0, (stageRect.height - hostHeight) / 2);
    const portrait = orientation === 'portrait';
    const spineX = portrait ? hostLeft : hostLeft + hostWidth / 2;

    els.stage.dataset.readerOrientation = orientation;
    els.stage.style.setProperty('--vespera-host-left', `${hostLeft}px`);
    els.stage.style.setProperty('--vespera-host-top', `${hostTop}px`);
    els.stage.style.setProperty('--vespera-host-width', `${hostWidth}px`);
    els.stage.style.setProperty('--vespera-host-height', `${hostHeight}px`);
    els.stage.style.setProperty('--vespera-page-width', `${bounds.maxWidth}px`);

    const workspace = els.stage.closest('.book-workspace');
    workspace?.style.setProperty('--vespera-book-half-width', `${hostWidth / 2}px`);
    workspace?.style.setProperty('--vespera-host-width', `${hostWidth}px`);

    spine.style.setProperty('--vespera-spine-x', `${spineX}px`);
    spine.style.setProperty('--vespera-spine-y', `${hostTop}px`);
    spine.style.setProperty('--vespera-spine-height', `${hostHeight}px`);
    spine.style.setProperty('--vespera-spine-width', portrait ? '8px' : '10px');
  };

  lockBookHost = function viewportLockBookHost(bounds) {
    const columns = bounds.spread ? 2 : 1;
    const hostWidth = Math.max(1, Math.round(bounds.maxWidth * columns));
    const hostHeight = Math.max(1, Math.round(bounds.maxHeight));
    state.bounds = bounds;

    Object.assign(els.book.style, {
      width: `${hostWidth}px`,
      height: `${hostHeight}px`,
      minWidth: `${hostWidth}px`,
      minHeight: `${hostHeight}px`,
      maxWidth: `${hostWidth}px`,
      maxHeight: `${hostHeight}px`,
      position: 'relative',
      zIndex: '4',
      flex: '0 0 auto',
      margin: '0',
      padding: '0',
    });

    positionSpine(bounds);
  };

  initPageFlip = function viewportInitPageFlip(manifest, initialIndex = 0) {
    if (!window.St?.PageFlip) {
      throw new Error('StPageFlip did not load from ../vendor/page-flip.browser.min.js');
    }

    const bounds = calculatePageBounds(manifest);
    const rigidOuterCover = usesRigidPhysics(manifest.pages[0]);

    lockBookHost(bounds);

    // Use the rendered physical sheet dimensions as PageFlip's fixed page
    // dimensions. Vespera itself reflows the book when the viewport changes.
    // This removes the old second sizing decision that created center slack.
    const pageFlip = new St.PageFlip(els.book, {
      width: bounds.maxWidth,
      height: bounds.maxHeight,
      size: 'fixed',
      maxShadowOpacity: 0.42,
      showCover: rigidOuterCover,
      mobileScrollSupport: false,
      usePortrait: !bounds.spread,
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
  };

  // Height is now as important as width. Browser chrome opening/closing can
  // materially change the available book area even without an orientation turn.
  scheduleReflow = function viewportScheduleReflow(force = false) {
    window.clearTimeout(state.resizeTimer);
    state.resizeTimer = window.setTimeout(() => {
      const previous = state.viewport || { width: window.innerWidth, height: window.innerHeight };
      const next = { width: window.innerWidth, height: window.innerHeight };
      const orientationChanged = (previous.width > previous.height) !== (next.width > next.height);
      const widthChanged = Math.abs(previous.width - next.width) > 24;
      const heightChanged = Math.abs(previous.height - next.height) > 24;

      if (force || orientationChanged || widthChanged || heightChanged) {
        reflowReader();
      }
    }, 180);
  };

  window.visualViewport?.addEventListener('resize', () => scheduleReflow(false));
})();
