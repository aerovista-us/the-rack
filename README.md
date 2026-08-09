# Vespera Publishing - The Rack

A static, JSON-powered comic library and reader. It displays PNG/JPG/WebP pages and can insert short MP4/WebM videos anywhere in the reading sequence.

## Run it

Browsers usually block `fetch('rack.json')` when `index.html` is opened directly as a `file://` URL. Serve the folder with any static web server:

```bash
cd vespera-the-rack
python -m http.server 8080
```

Then open `http://localhost:8080`.

**Production:** [https://therack.aerovista.us/](https://therack.aerovista.us/)  
Same pattern as [thesignal.aerovista.us](https://thesignal.aerovista.us) - GitHub Pages (`aerovista-us/the-rack`) + Cloudflare DNS CNAME. See [docs/github-pages-deploy.md](./docs/github-pages-deploy.md).

Remodel SOS deep link: `https://therack.aerovista.us/#/read/remodel-sos-volume-1/1`

## Add a comic

1. Create a content folder:

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

2. Copy the sample structure from `rack.example.json` into `rack.json`.
3. Set the cover image and list every image/video in the exact order it should appear.
4. Refresh the page. No compilation or build step is required.

## Supported sequence items

### Image

```json
{ "type": "image", "src": "content/my-comic/pages/001.png", "alt": "Page 1" }
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

For mobile compatibility, use H.264 video with AAC audio in an MP4 container. Keep clips under roughly 30 seconds and compress them for web delivery.

## Reader controls

- Left/right arrow or Page Up/Page Down
- Swipe on mobile
- Thumbnail rail (motion moments show poster + MOTION badge)
- Fullscreen
- Deep links such as `#/read/remodel-sos-volume-1/4`
- Optional automatic advance after a video ends

## Page-flip

Magazine-style StPageFlip was prototyped and then paused — see [docs/page-flip-reader.md](./docs/page-flip-reader.md). The live reader is the flat sequential stage again.
