# Device test notes — v0.3

Observed on Android device testing after v0.2:

- portrait viewport could remain in a two-page landscape spread, shrinking the book excessively
- orientation/reflow could leave the rendered book blank while reader chrome remained visible
- image aspect ratios varied enough that one global `contain` policy exposed large paper bands

v0.3 acceptance targets:

1. Portrait phone renders exactly one complete page at a useful size.
2. Landscape phone may render a complete two-page spread without vertical clipping.
3. Rotating between orientations preserves the current page and never leaves a persistent blank stage.
4. Each image page can choose `cover` or `contain`; comic interiors default to full-bleed treatment.
5. The PageFlip host is recreated during controlled reflow so stale wrapper/inline sizing state cannot carry into the new orientation.
