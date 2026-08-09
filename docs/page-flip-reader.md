# Page-flip reader

The Rack shelf UI stays the same. The in-page comic reader uses **StPageFlip** (`page-flip@2.0.7`) for magazine-style page turns, with mobile viewport sizing adapted from `../template/magazine.html`.

## Behavior

- Image and video sequence items from `rack.json` become flip pages.
- Drag a corner, swipe, arrows, or keyboard to turn.
- Thumbnails / deep links use `turnToPage`; adjacent nav uses animated `flipNext` / `flipPrev`.
- Off-screen videos pause when you leave their page.
- Stage size follows `#readerStage` via `getBoundingClientRect` + `visualViewport` + `ResizeObserver` (portrait, fixed size, `object-fit: contain`).
- If the library fails to load, the reader falls back to the previous flat image/video stage.

## Files

| Path | Role |
|------|------|
| `assets/js/app.js` | Shelf + flip reader |
| `assets/css/styles.css` | Flip stage / `.page` / mobile safe-area |
| `vendor/page-flip.browser.min.js` | Local StPageFlip bundle |
| `scripts/pull-page-flip.ps1` | Refresh vendor from jsDelivr |

## Deploy note

Include `vendor/` when syncing to GitHub Pages so air-gapped / Tracking Prevention browsers can still flip after CDN failure.
