// Mobile WebView entry point. Wraps the shared `Overlayer` class as the
// functional `window.__TSOverlayer` API expected by the injected JS in
// apps/mobile/src/lib/readerHtml.ts.
//
// Bundled by apps/web/scripts/build-mobile-overlay.mjs into a single IIFE
// string emitted to apps/mobile/src/lib/readerOverlayScript.generated.ts.
// Hand-editing that generated file is forbidden — change THIS file instead
// and re-run `pnpm -C apps/web build:mobile-overlay`.
//
// Why a wrapper, not a direct class export:
//   1. readerHtml.ts uses a factory shape (`__TSOverlayer.create()`) plus
//      free draw fns (`__TSOverlayer.highlight`). Keeping that contract
//      means we don't have to touch ~50 callsites in mobile.
//   2. Older Android Chromium WebView (Android 7-9, ~Chromium 51-62) does
//      not support ES private class fields. esbuild downlevels them when
//      we target es2017, but the public surface stays plain functions on
//      a plain object.

import { Overlayer } from './readerOverlay'
import type { DrawFn, DrawOptions } from './readerOverlay'

declare global {
  interface Window {
    __TSOverlayer?: TSOverlayerGlobal
  }
}

interface TSOverlayerInstance {
  element: SVGSVGElement
  add: (key: string, range: Range, draw: DrawFn, options?: DrawOptions) => void
  remove: (key: string) => void
  clear: () => void
  redraw: () => void
  syncScroll: () => void
  hitTest: (point: { x: number; y: number }) => [string, Range] | []
  size: () => number
  markJustAnchored: (ms?: number) => void
  isJustAnchored: () => boolean
}

interface TSOverlayerGlobal {
  create: () => TSOverlayerInstance
  highlight: DrawFn
  underline: DrawFn
  outline: DrawFn
  strikethrough: DrawFn
  squiggly: DrawFn
  pulse: DrawFn
}

function adapt(ov: Overlayer): TSOverlayerInstance {
  return {
    element: ov.element,
    add: (key, range, draw, options) => ov.add(key, range, draw, options),
    remove: (key) => ov.remove(key),
    clear: () => ov.clear(),
    redraw: () => ov.redraw(),
    syncScroll: () => ov.syncScroll(),
    hitTest: (point) => ov.hitTest(point),
    size: () => ov.size,
    markJustAnchored: (ms) => ov.markJustAnchored(ms),
    isJustAnchored: () => ov.isJustAnchored(),
  }
}

if (typeof window !== 'undefined' && !window.__TSOverlayer) {
  window.__TSOverlayer = {
    create: () => adapt(new Overlayer()),
    highlight: Overlayer.highlight,
    underline: Overlayer.underline,
    outline: Overlayer.outline,
    strikethrough: Overlayer.strikethrough,
    squiggly: Overlayer.squiggly,
    pulse: Overlayer.pulse,
  }
}
