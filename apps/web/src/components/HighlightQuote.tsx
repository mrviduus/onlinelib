import { anchorContextSnippet, contextFromAnchor } from '@textstack/shared'
import type { TextAnchor } from '@textstack/shared'

/**
 * A saved highlight, shown with the text it was taken from.
 *
 * The mobile counterpart (`apps/mobile/src/components/HighlightQuote.tsx`) carries the full story:
 * a one-word highlight rendered as `"in"` on every screen, while ~30 characters of the real page sat
 * unread in the highlight's own anchor and two API projections dropped the field.
 *
 * Highlights with no stored surroundings — PDF-rect anchors, and the old no-anchor save path — render
 * as the passage alone rather than as an empty frame.
 */
export function HighlightQuote({
  anchorJson,
  anchor,
  selectedText,
  className,
}: {
  /** The stored anchor as JSON, as the list and review APIs return it. */
  anchorJson?: string | null
  /** The same anchor already parsed — the reader drawer holds it in this shape. */
  anchor?: Partial<TextAnchor> | null
  selectedText: string
  className?: string
}) {
  const snippet = anchor
    ? contextFromAnchor(anchor, selectedText)
    : anchorContextSnippet(anchorJson, selectedText)

  if (!snippet) return <span className={className}>{selectedText}</span>

  return (
    <span className={className}>
      <span className="highlight-quote__context">{snippet.before ? `…${snippet.before}` : ''}</span>
      <mark className="highlight-quote__match">{snippet.match}</mark>
      <span className="highlight-quote__context">{snippet.after ? `${snippet.after}…` : ''}</span>
    </span>
  )
}
