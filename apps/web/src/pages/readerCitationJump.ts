import type { AskCitation } from '../api/ask'

/**
 * Where an "Ask this book" citation click should land (ADR-012 S3c).
 * - `pdf`: jump the Original PDF viewer to `page` (page-anchored citation in Original mode).
 * - `reflow`: fall through to the reflow-DOM chapter scroll (chapter-anchored citations).
 */
export type CitationJump =
  | { kind: 'pdf'; page: number }
  | { kind: 'reflow' }

/**
 * Decides how to navigate to a citation. PDF chunks aren't chapter-anchored, so when the
 * reader is showing the pixel-perfect Original PDF and the citation carries a `sourcePage`,
 * we jump the viewer to that page instead of scrolling the reflow DOM.
 */
export function resolveCitationJump(
  citation: Pick<AskCitation, 'sourcePage'>,
  originalActive: boolean,
): CitationJump {
  if (originalActive && citation.sourcePage != null) {
    return { kind: 'pdf', page: citation.sourcePage }
  }
  return { kind: 'reflow' }
}
