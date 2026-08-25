# Vespera / Lumina Comic Page Template

## Canonical digital sheet

- **Aspect ratio:** 2:3
- **Reference canvas:** **1024 × 1536 px**
- Higher-resolution exports should use exact multiples of the same ratio, for example 2048 × 3072 or 3072 × 4608.
- The reader treats this ratio as the physical sheet. It scales the sheet to the largest size the available viewport can support.

## Export rules

1. Export the complete page at the exact template ratio.
2. Artwork intended to bleed should reach all four canvas edges.
3. Do not bake blank paper margins or presentation framing into the image; the Publication Engine supplies paper, gutter, edge and shadow treatment.
4. Keep important lettering, faces and speech bubbles inside a **minimum 48 px safe inset** on a 1024 × 1536 canvas. For high-density pages, 64 px is preferred.
5. Keep page numbers / mastheads inside the safe area unless intentionally full-bleed.
6. PNG or high-quality WebP are preferred for comic pages.
7. Every image page in one publication should use the same sheet ratio. Mixed ratios are treated as preflight warnings and require normalization before final release.

## Reader behavior

The reader does **not** invent a new page ratio per asset. A bound publication has one physical sheet size. The reader:

- reads the publication ratio from `publication.json` / manifest,
- fits that physical sheet to the maximum available viewport,
- keeps facing pages touching at the spine,
- adds material / paper / gutter effects outside the authored artwork,
- uses `contain` only as a compatibility fallback for legacy pages that are not yet normalized.

## Lumina goal

The Lumina Image Studio template should eventually expose:

- 1024 × 1536 base canvas,
- optional 2048 × 3072 high-resolution canvas,
- bleed-to-edge guide,
- 48 px and 64 px safe-area guides,
- center / panel guide helpers,
- Vespera publication metadata preset,
- one-click export into a publication `pages/` directory.

The intended workflow is:

**Create in Lumina → validate ratio/safe area → export → Vespera manifest → publish.**
