# Vespera Publishing — The Rack

A static, JSON-powered comic library and cinematic web reader. It displays PNG/JPG/WebP pages, inserts short MP4/WebM motion moments in sequence, and now supports physical page turns plus guided panel-by-panel reading.

**Production:** https://therack.aerovista.us/

The canonical repository is **`aerovista-us/the-rack`**.

## Rack reader v3

The publishing contract is still intentionally simple — content folders plus `rack.json` — but the reader is now mobile-first:

- Full phone viewport is reserved for the comic page; reader chrome floats above it and fades away
- Physical page mode uses the bundled StPageFlip engine for real curl/drag/page-turn behavior
- Portrait phones show one fitted page; wide screens can naturally open into a spread
- Panel Focus (`⌖`) zooms into story targets so dialogue remains readable on a phone
- Tap or **Space** advances to the next Panel Focus target
- Each page can define its own exact focus rectangles
- Unmapped pages automatically get six overlapping readable focus zones
- Motion moments remain in the same authored sequence
- Local `Continue Reading` progress still requires no account
- Existing search, series browsing, filters, sharing, and analytics remain intact

The shelf/discovery layer still lives in `assets/js/v2.js` + `assets/css/v2.css`. The new reader is layered in `assets/js/reader-v3.js` + `assets/css/reader-v3.css`, and uses the local `vendor/page-flip.browser.min.js` dependency already committed to this repo.

## Run it

Browsers usually block `fetch('rack.json')` when `index.html` is opened directly as a `file://` URL. Serve the folder with any static web server:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Add a comic

```text
content/my-comic/
├── pages/
│   ├── 001.png
│   ├── 002.png
│   └── 003.png
└── video/
    ├── moment-01.mp4
    └── moment-01-poster.jpg
```

Then add one book object to `rack.json`.

### Recommended book metadata

```json
{
  "id": "my-series-issue-1",
  "series": "My Series",
  "title": "Issue No. 1 — The Beginning",
  "issue": 1,
  "status": "complete",
  "featured": true,
  "creator": "Vespera Publishing",
  "description": "Short shelf description.",
  "cover": "content/my-series/pages/cover.png",
  "shareImage": "https://therack.aerovista.us/content/my-series/pages/cover.png",
  "shareUrl": "read/my-series-issue-1/",
  "readerMode": "book",
  "genres": ["comedy", "mystery"],
  "tags": ["lake", "adventure"],
  "sequence": []
}
```

## Image pages and Panel Focus

A normal image page needs only `src` and `alt`. If no panel map exists, Panel Focus generates a safe 2×3 (or 3×2 landscape) sequence automatically.

For exact comic reading order, add normalized `focusRegions`. `x`, `y`, `w`, and `h` are fractions of the full page from `0` to `1`:

```json
{
  "type": "image",
  "src": "content/my-comic/pages/001.png",
  "alt": "Page 1",
  "focusRegions": [
    { "x": 0.04, "y": 0.05, "w": 0.92, "h": 0.28, "label": "Opening panel" },
    { "x": 0.04, "y": 0.36, "w": 0.44, "h": 0.27, "label": "Left middle" },
    { "x": 0.52, "y": 0.36, "w": 0.44, "h": 0.27, "label": "Right middle" },
    { "x": 0.04, "y": 0.66, "w": 0.92, "h": 0.29, "label": "Closing panel" }
  ]
}
```

This is deliberately page-specific: a splash page may have one focus region, a six-panel grid may have six, and irregular pages can use any rectangle sequence needed.

## Video page

```json
{
  "type": "video",
  "src": "content/my-comic/video/moment-01.mp4",
  "poster": "content/my-comic/video/moment-01-poster.jpg",
  "caption": "A moment between pages",
  "autoplay": false,
  "muted": false,
  "advanceOnEnd": true
}
```

For mobile compatibility, use H.264 video with AAC audio in an MP4 container.

## Reader controls

### Physical page mode

- Drag a page corner
- Tap/click left or right edge
- Swipe
- Left/right arrows or Page Up/Page Down
- Fullscreen

### Panel Focus

- Tap `⌖`
- Tap artwork or press **Space** for next focus target
- Swipe left/right for next/previous target
- Tap `⌖` again to return to the physical page

## Progress

Reading progress remains stored locally under:

```text
rack.v2.progress
```

No account is required.

## Publishing rule

Keep The Rack easy to publish to:

1. Drop pages/motion assets into a content folder.
2. Add or update one `rack.json` entry.
3. Optionally add exact `focusRegions` for important pages.
4. Commit.
5. Read the finished release on The Rack.

No build step is required.
