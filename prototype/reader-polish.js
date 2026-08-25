'use strict';

/* Presentation-only interaction polish. No paging or geometry logic lives here. */
(() => {
  const app = document.querySelector('#readerApp');
  const stage = document.querySelector('#bookStage');
  const paper = document.querySelector('#paperToggle');
  const fullscreen = document.querySelector('#fullscreenButton');
  if (!app || !stage) return;

  let idleTimer = 0;
  const coarse = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
  const idleDelay = coarse ? 2200 : 3200;

  function wake() {
    app.classList.remove('is-ui-idle');
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      if (!document.querySelector(':focus-visible')) app.classList.add('is-ui-idle');
    }, idleDelay);
  }

  function setInteraction(active) {
    app.classList.toggle('is-touching-book', active);
    if (active) wake();
  }

  paper?.setAttribute('title', 'Toggle simulated paper texture');
  fullscreen?.setAttribute('title', 'Toggle fullscreen reader');

  ['pointermove', 'pointerdown', 'touchstart', 'keydown', 'focusin'].forEach((eventName) => {
    window.addEventListener(eventName, wake, { passive: true });
  });

  stage.addEventListener('pointerdown', () => setInteraction(true), { passive: true });
  window.addEventListener('pointerup', () => setInteraction(false), { passive: true });
  window.addEventListener('pointercancel', () => setInteraction(false), { passive: true });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) wake();
  });

  wake();
})();
