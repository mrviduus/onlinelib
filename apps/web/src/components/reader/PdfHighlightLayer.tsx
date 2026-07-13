import { paintRect, isPdfAnchor } from '@textstack/shared'
import type { HighlightColor, StoredHighlight } from '../../lib/offlineDb'

// Persistent PDF highlights for ONE rendered page. Absolutely-positioned tinted
// <div>s painted from the stored quad-rects (page-relative, unscaled) scaled by
// the live render scale — mounted inside `.pdf-page`, over the text layer.
//
// Blend choice:
//  - Light mode: `mix-blend-mode: multiply` — the pastel tint darkens the
//    paper-white scan like a real marker, keeping the underlying glyphs legible.
//  - Dim/invert mode: the canvas is CSS-inverted (dark scan). Multiply over dark
//    would crush the tint to near-black, so we drop the blend to plain
//    source-over (`.pdf-hl-layer--invert`) — the translucent pastel then sits
//    visibly on the darkened page. See pdfOriginal.css.

// Same palette as the reflow overlay (HighlightOverlayLayer COLOR_MAP), as rgba
// so `multiply` reads the alpha. CSS-var-driven so themes can override.
const COLOR_MAP: Record<HighlightColor, string> = {
  yellow: 'var(--reader-overlay-hl-yellow, rgba(254, 240, 138, 0.5))',
  green: 'var(--reader-overlay-hl-green, rgba(187, 247, 208, 0.5))',
  pink: 'var(--reader-overlay-hl-pink, rgba(251, 207, 232, 0.5))',
  blue: 'var(--reader-overlay-hl-blue, rgba(191, 219, 254, 0.5))',
}

interface Props {
  page: number
  highlights: StoredHighlight[]
  scale: number
  invert?: boolean
  onHighlightClick?: (highlight: StoredHighlight, rect: DOMRect) => void
}

export function PdfHighlightLayer({ page, highlights, scale, invert, onHighlightClick }: Props) {
  const pageHls = highlights.filter((h) => isPdfAnchor(h.anchor) && h.anchor.page === page)
  if (pageHls.length === 0) return null

  return (
    <div className={`pdf-hl-layer${invert ? ' pdf-hl-layer--invert' : ''}`} aria-hidden="true">
      {pageHls.map((h) => {
        // Guarded by the filter above — narrow for the rects.
        const anchor = h.anchor
        if (!isPdfAnchor(anchor)) return null
        return anchor.rects.map((r, i) => {
          const box = paintRect(r, scale)
          return (
            <div
              key={`${h.id}:${i}`}
              className="pdf-hl-rect"
              data-highlight-id={h.id}
              style={{
                left: box.left,
                top: box.top,
                width: box.width,
                height: box.height,
                background: COLOR_MAP[h.color],
              }}
              onClick={(e) => {
                e.stopPropagation()
                onHighlightClick?.(h, (e.currentTarget as HTMLElement).getBoundingClientRect())
              }}
            />
          )
        })
      })}
    </div>
  )
}
