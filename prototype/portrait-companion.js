'use strict';

(() => {
  const stage = document.querySelector('#bookStage');
  if (!stage) return;

  let attachedFlip = null;
  let lastKey = '';

  const leaf = document.createElement('div');
  leaf.id = 'vesperaCompanionLeaf';
  leaf.className = 'vespera-companion-leaf';
  leaf.setAttribute('aria-hidden', 'true');

  const sheet = document.createElement('div');
  sheet.className = 'vespera-companion-leaf__sheet';
  leaf.append(sheet);
  stage.append(leaf);

  const style = document.createElement('style');
  style.id = 'vesperaCompanionLeafStyles';
  style.textContent = `
    .vespera-companion-leaf {
      position: absolute;
      z-index: 2;
      pointer-events: none;
      overflow: hidden;
      opacity: 0;
      transform-style: preserve-3d;
      perspective: 1200px;
      transition: opacity 130ms ease;
    }

    .vespera-companion-leaf.is-visible {
      opacity: .96;
    }

    .vespera-companion-leaf__sheet {
      position: absolute;
      right: 0;
      top: 0;
      height: 100%;
      width: var(--companion-sheet-width, 300px);
      overflow: hidden;
      transform-origin: 100% 50%;
      transform: perspective(1200px) rotateY(5deg) translateX(1px);
      border: 1px solid color-mix(in srgb, var(--paper-edge) 72%, transparent);
      border-right: 0;
      border-radius: 3px 0 0 3px;
      background: var(--paper);
      box-shadow:
        -10px 11px 26px rgba(0,0,0,.18),
        inset -22px 0 26px -22px rgba(25,16,8,.78),
        inset 0 0 0 1px rgba(255,255,255,.16);
    }

    .vespera-companion-leaf__sheet::before {
      content: "";
      position: absolute;
      z-index: 5;
      inset: 0;
      pointer-events: none;
      opacity: calc(var(--texture-opacity, .15) * .72);
      mix-blend-mode: multiply;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='260' height='260'%3E%3Cfilter id='paper'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.62' numOctaves='5' seed='11' stitchTiles='stitch' result='noise'/%3E%3CfeDiffuseLighting in='noise' lighting-color='%23f5ead7' surfaceScale='2.1' result='light'%3E%3CfeDistantLight azimuth='135' elevation='52'/%3E%3C/feDiffuseLighting%3E%3CfeBlend in='noise' in2='light' mode='multiply'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23paper)'/%3E%3C/svg%3E");
      background-size: 260px 260px;
    }

    .vespera-companion-leaf__sheet::after {
      content: "";
      position: absolute;
      z-index: 6;
      inset: 0;
      pointer-events: none;
      background: linear-gradient(to left, transparent 72%, rgba(255,255,255,.025) 88%, rgba(255,255,255,.07));
      box-shadow: inset -28px 0 30px -23px rgba(18,11,6,.62);
    }

    .vespera-companion-leaf__media,
    .vespera-companion-leaf__html {
      position: absolute;
      z-index: 2;
      inset: 0;
      width: 100%;
      height: 100%;
    }

    .vespera-companion-leaf__media {
      display: block;
      user-select: none;
      -webkit-user-drag: none;
    }

    .vespera-companion-leaf__html {
      overflow: hidden;
      padding: 7%;
      color: #211b16;
      font-family: Georgia, "Times New Roman", serif;
      font-size: clamp(10px, 2.4vw, 17px);
      line-height: 1.42;
      background: var(--paper);
    }

    .vespera-companion-leaf__cover-reverse {
      position: absolute;
      z-index: 2;
      inset: 0;
      background:
        linear-gradient(to left, rgba(63,43,25,.13), transparent 20%),
        linear-gradient(145deg, color-mix(in srgb, var(--paper) 88%, #b89d78), var(--paper));
    }
  `;
  document.head.append(style);

  function getReaderState() {
    // reader.js is a classic script, so its top-level lexical bindings are
    // available to subsequent classic scripts without becoming window globals.
    try {
      return { readerState: state, readerEls: els };
    } catch {
      return null;
    }
  }

  function clearSheet() {
    sheet.replaceChildren();
  }

  function renderCompanionPage(page, index) {
    clearSheet();

    // Immediately after opening the front cover, avoid showing the exterior
    // cover art face-up on the left. A muted reverse-cover surface reads more
    // naturally until the first true interior spread is established.
    if (!page || index === 0 || String(page.role || '').toLowerCase() === 'front-cover') {
      const reverse = document.createElement('div');
      reverse.className = 'vespera-companion-leaf__cover-reverse';
      sheet.append(reverse);
      return;
    }

    if (page.type === 'image') {
      const img = document.createElement('img');
      img.className = 'vespera-companion-leaf__media';
      img.src = page.src;
      img.alt = '';
      img.draggable = false;
      img.decoding = 'async';
      img.style.objectFit = page.fit || 'cover';
      img.style.objectPosition = page.position || '50% 50%';
      sheet.append(img);
      return;
    }

    if (page.type === 'html') {
      const html = document.createElement('article');
      html.className = 'vespera-companion-leaf__html';
      html.innerHTML = page.html;
      sheet.append(html);
    }
  }

  function update() {
    const reader = getReaderState();
    if (!reader?.readerState?.manifest || !reader.readerState.pageFlip || !reader.readerState.bounds) {
      leaf.classList.remove('is-visible');
      return;
    }

    const { readerState } = reader;
    const orientation = readerState.pageFlip.getOrientation?.() || 'portrait';
    const index = Math.max(0, readerState.pageFlip.getCurrentPageIndex?.() || 0);
    const bounds = readerState.bounds;

    if (orientation !== 'portrait' || index <= 0) {
      leaf.classList.remove('is-visible');
      lastKey = '';
      return;
    }

    const stageRect = stage.getBoundingClientRect();
    const hostWidth = Math.max(1, Math.round(bounds.maxWidth));
    const hostHeight = Math.max(1, Math.round(bounds.maxHeight));
    const hostLeft = Math.max(0, (stageRect.width - hostWidth) / 2);
    const hostTop = Math.max(0, (stageRect.height - hostHeight) / 2);
    const availableLeft = Math.max(0, hostLeft - 2);

    if (availableLeft < 18) {
      leaf.classList.remove('is-visible');
      return;
    }

    const visibleWidth = Math.min(availableLeft, hostWidth * .62);
    Object.assign(leaf.style, {
      left: `${Math.max(0, hostLeft - visibleWidth)}px`,
      top: `${hostTop}px`,
      width: `${visibleWidth + 2}px`,
      height: `${hostHeight}px`,
    });
    sheet.style.setProperty('--companion-sheet-width', `${hostWidth}px`);

    const previousIndex = Math.max(0, index - 1);
    const key = `${previousIndex}:${hostWidth}:${hostHeight}`;
    if (key !== lastKey) {
      renderCompanionPage(readerState.manifest.pages[previousIndex], previousIndex);
      lastKey = key;
    }

    leaf.classList.add('is-visible');
  }

  function ensureAttached() {
    const reader = getReaderState();
    const flip = reader?.readerState?.pageFlip;
    if (!flip || flip === attachedFlip) return;

    attachedFlip = flip;
    flip.on('init', update);
    flip.on('flip', update);
    flip.on('changeOrientation', update);
    flip.on('changeState', () => requestAnimationFrame(update));
    requestAnimationFrame(update);
  }

  window.addEventListener('resize', () => requestAnimationFrame(update));
  window.addEventListener('orientationchange', () => requestAnimationFrame(update));
  document.addEventListener('fullscreenchange', () => requestAnimationFrame(update));

  // Reflow replaces the PageFlip instance, so periodically reattach to the new
  // instance. This is intentionally presentation-only and never drives paging.
  window.setInterval(() => {
    ensureAttached();
    update();
  }, 350);
})();
