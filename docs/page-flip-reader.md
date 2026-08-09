# Page-flip reader

The Rack shelf UI stays the same. The in-page comic reader uses **StPageFlip** (`page-flip@2.0.7`) for magazine-style page turns, with mobile viewport sizing adapted from `../template/magazine.html`.

## Behavior

- **Images** load into StPageFlip. The flip book is sized to the comic page aspect ratio and centered in `#stageFrame`, so turn hit-targets match the art (not the letterbox).
- **Videos** ("motion moments") render in `#momentStage` outside the flip widget so native controls work. Leaving a moment pauses the video.
- Drag a corner, swipe, arrows, or keyboard to move through the full `rack.json` sequence.
- Thumbnails / deep links jump by sequence index; adjacent image→image nav animates with `flipNext` / `flipPrev`.
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
