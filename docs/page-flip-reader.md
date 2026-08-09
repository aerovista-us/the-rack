# Page-flip reader (paused)

StPageFlip magazine-style page turns were prototyped for The Rack and then **removed from the live reader** (Aug 2026) because image pages were not reliably visible in production.

## Current reader

The Rack uses the original **flat sequential stage**:

- Images and videos from `rack.json` render one at a time in `#readerStage`
- Arrows, keyboard, swipe, thumbnails, fullscreen
- Motion moments keep poster + **MOTION** badges in the thumbnail rail

## Kept on disk (not wired)

| Path | Role |
|------|------|
| `vendor/page-flip.browser.min.js` | StPageFlip bundle (unused by `app.js` for now) |
| `scripts/pull-page-flip.ps1` | Refresh vendor from jsDelivr |
| `../template/magazine.html` | Reference magazine flip + mobile sizing |

Re-enable only after a dedicated integration that keeps `#readerStage` sizing stable on mobile and does not hide/collapse the image layer.
