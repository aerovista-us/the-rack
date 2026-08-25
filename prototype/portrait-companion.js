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
      background: var(--paper);
      transform-style: preserve-3d;
      perspective: 1600px;
      transition: opacity 130ms ease;
    }

    .vespera-companion-leaf.is-visible { opacity: .96; }

    .vespera-companion-leaf__sheet {
      position: absolute;
      right: 0;
      top: 0;
      height: 100%;
      width: var(--companion-sheet-width, 300px);
      overflow: hidden;
      transform-origin: 100% 50%;
      transform: perspective(1600px) rotateY(1.25deg);
      border: 1px solid color-mix(in srgb, var(--paper-edge) 72%, transparent);
      border-right: 0;
      border-radius: 2px 0 0 2px;
      background: var(--paper);
      box-shadow:
        -10px 11px 26px rgba(0,0,0,.16),
        inset -24px 0 28px -23px rgba(25,16,8,.82),
        inset 0 0 0 1px rgba(255,255,255,.16);
    }

    .vespera-companion-leaf::before,
    .vespera-companion-leaf__sheet::before {
      content: "";
      position: absolute;
      z-index: 5;
      inset: 0;
      pointer-events: none;
      opacity: calc(var(--texture-opacity, .15) * .68);
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
      background: linear-gradient(to left, transparent 71%, rgba(255,255,255,.025) 88%, rgba(255,255,255,.07));
      box-shadow: inset -30px 0 32px -23px rgba(18,11,6,.66);
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
        linear-gradient(to left, rgba(63,43,25,.14), transparent 20%),
        linear-gradient(145deg, color-mix(in srgb, var(--paper) 88%, #b89d78), var(--paper));
    }
  `;
  document.head.append(style);

  function getReaderState() {
    try {
      return { readerState: state, readerEls: els };
    } catch {
      return null;
    }
  }

  function renderCompanionPage(page, index) {
    sheet.replaceChildren();

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

    /* Fill every available pixel from the viewport/stage edge to the spine.
       The old .62 cap was visually moving the unused gap into the book center. */
    const visibleWidth = Math.max(0, Math.min(stageRect.width, hostLeft + 1));
    if (visibleWidth < 12) {
      leaf.classList.remove('is-visible');
      return;
    }

    Object.assign(leaf.style, {
      left: '0px',
      top: `${hostTop}px`,
      width: `${visibleWidth}px`,
      height: `${hostHeight}px`,
    });

    /* Keep a true full-size companion sheet anchored to the spine. If the
       viewport is unusually wide, the leaf's paper substrate still continues
       to the window edge instead of exposing desk/background. */
    sheet.style.setProperty('--companion-sheet-width', `${hostWidth}px`);

    const previousIndex = Math.max(0, index - 1);
    const key = `${previousIndex}:${hostWidth}:${hostHeight}:${Math.round(visibleWidth)}`;
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

  window.setInterval(() => {
    ensureAttached();
    update();
  }, 350);
})();
