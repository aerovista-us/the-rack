# Vespera Publishing — The Rack

A static, JSON-powered comic library and cinematic web reader. It displays PNG/JPG/WebP pages and can insert short MP4/WebM motion moments anywhere in a reading sequence.

**Production:** https://therack.aerovista.us/

The canonical repository is **`aerovista-us/the-rack`**.

## Rack v2

Rack v2 keeps the original publishing contract — content folders plus `rack.json` — while adding a richer reader and discovery layer:

- Featured release
- Series browsing
- Search + filter chips
- Local `Continue Reading` progress with no account required
- Focus mode (one page)
- Book mode (two-page spreads on larger screens)
- Motion moments woven into the sequence
- Series-aware previous/next navigation and end-of-book actions
- Per-book share URLs and social metadata entry pages
- Optional Umami-compatible analytics events (`book_open`, `motion_play`, `book_complete`, `book_share`, `reader_mode`, `series_open`, `shelf_filter`)

The previous reader files remain in the repo for rollback/reference; `index.html` now loads `assets/js/v2.js` and `assets/css/v2.css`.

## Run it

Browsers usually block `fetch('rack.json')` when `index.html` is opened directly as a `file://` URL. Serve the folder with any static web server:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Add a comic

Create a content folder:

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

### Recommended v2 book metadata

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
  "readerMode": "focus",
  "spreadMode": "auto",
  "genres": ["comedy", "mystery"],
  "tags": ["lake", "adventure"],
  "sequence": []
}
```

Most v2 fields are optional. Existing books using the original schema continue to render.

## Supported sequence items

### Image

```json
{
  "type": "image",
  "src": "content/my-comic/pages/001.png",
  "alt": "Page 1",
  "title": "Page 1"
}
```

### Video

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

For mobile compatibility, use H.264 video with AAC audio in an MP4 container. Keep clips short and compress them for web delivery.

## Reader controls

- Left/right arrow or Page Up/Page Down
- Swipe on mobile
- Tap/click left and right page edges
- Thumbnail rail
- Fullscreen
- Focus / Book reading modes
- Deep links such as `#/read/omotl-issue-1/4`
- Optional automatic advance after a video ends

## Progress

Reading progress is stored locally under:

```text
rack.v2.progress
```

No account is required. A future authenticated sync layer can reuse the same book IDs and sequence positions.

## Sharing

For reliable social previews, a book can define `shareUrl` and `shareImage`. The current titles have static entry pages under `read/<book-id>/` that provide Open Graph/Twitter metadata and redirect normal browsers into the hash-based reader.

## Publishing rule

Keep The Rack easy to publish to. A creator should still be able to:

1. Drop pages/motion assets into a content folder.
2. Add/update one `rack.json` entry.
3. Commit.
4. Read the finished release on The Rack.

No build step is required.
