# Vespera Publication Engine — Page Authoring Template

## Canonical comic page

New comic artwork should use a **2:3 portrait page**.

Recommended Lumina working canvas:

- **1600 × 2400 px**
- lower-resolution draft/export: **1024 × 1536 px**
- aspect ratio: **2:3 / 0.6667**

The reader scales the physical sheet uniformly to the largest size the active viewport can contain. Pixel resolution can be higher or lower as long as the page ratio matches the publication manifest.

## Full bleed

Artwork intended to reach the paper edge should extend to all four canvas edges. Do not bake a cream/paper border into the artwork; the reader owns the physical paper treatment.

## Safe area

Keep important text, panel captions, page numbers, faces and speech bubbles at least **5% of page width** away from outer trim edges.

Use a slightly larger **7% inner/spine safe area** when practical because the reader adds simulated gutter/binding shading there.

For a 1600 × 2400 canvas:

- outer/top/bottom safe inset: about **80 px**
- inner/spine safe inset: about **112 px**

## Lumina authoring workflow

Lumina Image Studio now provides a Rack-specific authoring path under **File → The Rack**.

1. **New Page** — creates a **1600 × 2400** canvas with full-bleed fill, placeholder type and safe-area guides.
2. Design the page and keep important lettering/content inside the guides.
3. **Add Current Page** — classify the page as `front-cover`, `interior` or `back-cover`.
4. Repeat until the publication contains at least two pages.
5. **Export Package** — produces `{slug}.rack.zip`.

The exported package contains:

- `pages/*.png`
- `publication.json` using Vespera publication schema **0.1** and **1600 × 2400** format
- `rack-entry.json` for merging into The Rack `rack.json`

Current handoff:

- copy `pages/` to `the-rack/content/{slug}/pages/`
- merge the generated `rack-entry.json` shelf entry into The Rack `rack.json`

The Lumina runbook is `lumina-image-studio/docs/RACK_PUBLICATION.md`.

## Reader contract

The publication manifest defines the physical sheet ratio. New OMOTL pages should target the same 2:3 ratio so `fit: contain` fills the authored page without letterboxing or cropping.

The reader owns:

- viewport fitting and responsive scale
- page curl / flip geometry
- gutter and spine shading
- paper texture and stock treatment
- page-stack depth
- device/orientation adaptation

The authored page owns:

- panel layout
- lettering
- artwork
- page number / masthead if desired
- intentional print margins

Do not compensate for browser chrome, toolbar height or device size inside the page artwork.
