'use strict';

(() => {
  const TOLERANCE = 0.015; // 1.5% ratio drift before the asset is considered out of spec.
  let ran = false;

  function getManifest() {
    try {
      return state?.manifest || null;
    } catch {
      return null;
    }
  }

  function inspectImage(page, index, targetRatio) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const ratio = img.naturalHeight / img.naturalWidth;
        const drift = Math.abs(ratio - targetRatio) / targetRatio;
        resolve({
          index,
          src: page.src,
          width: img.naturalWidth,
          height: img.naturalHeight,
          ratio,
          drift,
          ok: drift <= TOLERANCE,
        });
      };
      img.onerror = () => resolve({ index, src: page.src, ok: false, loadError: true });
      img.src = page.src;
    });
  }

  async function run() {
    if (ran) return;
    const manifest = getManifest();
    if (!manifest?.pages?.length) return;
    ran = true;

    const width = Number(manifest.format?.width) || 1024;
    const height = Number(manifest.format?.height) || 1536;
    const targetRatio = height / width;
    const imagePages = manifest.pages
      .map((page, index) => ({ page, index }))
      .filter(({ page }) => page.type === 'image' && page.src);

    const results = await Promise.all(
      imagePages.map(({ page, index }) => inspectImage(page, index, targetRatio))
    );
    const mismatches = results.filter((result) => !result.ok);

    document.documentElement.dataset.publicationPreflight = mismatches.length ? 'warning' : 'ok';

    if (!mismatches.length) {
      console.info(`[Vespera preflight] ${results.length} image pages match ${width}×${height} (${width}:${height}) within ${TOLERANCE * 100}% tolerance.`);
      return;
    }

    console.groupCollapsed(
      `[Vespera preflight] ${mismatches.length}/${results.length} image pages do not match the publication sheet ratio ${width}×${height}.`
    );
    console.warn('These assets can require contain/bleed compensation and may create visible bands. Normalize them in Lumina before final publication.');
    mismatches.forEach((result) => {
      if (result.loadError) {
        console.warn(`Page ${result.index + 1}: could not inspect ${result.src}`);
        return;
      }
      console.warn(
        `Page ${result.index + 1}: ${result.width}×${result.height} (${(result.drift * 100).toFixed(1)}% ratio drift) — ${result.src}`
      );
    });
    console.groupEnd();
  }

  const timer = window.setInterval(() => {
    if (getManifest()) {
      window.clearInterval(timer);
      run();
    }
  }, 120);
})();
