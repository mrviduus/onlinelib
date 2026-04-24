# @textstack/reader-overlay

SVG-based annotation overlay used by the reader. Ports of foliate-js's
`overlayer.js` and `text-walker.js` (MIT, © John Factotum).

## Consumers

- **apps/web** — imports directly as `@textstack/reader-overlay`.
- **apps/mobile** — keeps a hand-maintained vanilla-JS port at
  `apps/mobile/src/lib/readerOverlayScript.ts` (inlined into the WebView HTML
  as a template literal string). The mobile port must stay behaviorally
  equivalent; a proper build-step that generates the IIFE string from this
  package's source is a future improvement.

When changing behavior in this package, check whether the mobile port needs
the same change. Previous backports: doc-coord rect storage + `syncScroll`
counter-translate, `uncollapseForMeasure` fallback, zero-area rect filter.
