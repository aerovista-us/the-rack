# Vespera Publication Engine — v0 prototype

This directory is an isolated proof of the reusable reader layer proposed for The Rack. It does **not** replace the production reader yet.

## What v0 proves

- A publication is loaded from a standalone JSON manifest.
- The reader contains no title-specific logic.
- Image and HTML pages can coexist in one ordered publication.
- StPageFlip is reused from The Rack's existing vendored `page-flip@2.0.7` bundle.
- The reader stage has explicit responsive geometry to avoid the earlier mobile/production collapse failure.
- Paper fiber/lighting is procedural SVG/CSS rather than a baked texture image.
- The visible left/right paper stack changes with reading progress.
- Covers can use hard-page density while internal sheets remain soft.
- Paper texture can be disabled at runtime, proving the material layer is separable from content.

## Run locally

From the repository root:

```bash
python -m http.server 8080
```

Then open:

```text
http://localhost:8080/prototype/
```

A different publication can be tested without changing reader code:

```text
http://localhost:8080/prototype/?manifest=another-publication.json
```

## Manifest contract

`publication.schema.json` is the first machine-readable schema. v0 intentionally supports only `image` and `html` page types. Video/audio/interactive pages belong in the next compatibility pass after page physics and mobile behavior are stable.

## Third-party research / dependencies

- **StPageFlip / page-flip 2.0.7** — existing vendored page-turn runtime in The Rack.
- **PaperLikePDF** (MIT) — research reference for procedural paper grain, diffuse lighting, perspective, and spine-shadow ideas. The v0 material CSS is a fresh implementation using the same browser primitives rather than copied project structure.
- **Okuma Reader** (MIT) — research reference for progress-aware page-stack depth and physical-book cues. v0 implements its own lightweight stack model.

Before production merge, preserve applicable third-party notices and re-check all dependency licenses/versions.
