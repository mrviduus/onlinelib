/**
 * The reflow reader's chrome — safe-area padding and theme colours — and the
 * rule about what may rebuild its document.
 *
 * Same defect the PDF viewer had, found while fixing that one. `buildReaderHtml`
 * takes safe-area insets, and the reader renders `<StatusBar hidden={!barsVisible}>`;
 * on Android hiding the status bar changes `insets.top`. `useReaderBars` hides
 * the bars three seconds after open and toggles them on every change of scroll
 * direction. So the HTML string changed, the WebView reloaded, and the document
 * was rebuilt many times per session with no user action.
 *
 * It is invisible here in a way it was not in the PDF, because
 * `useReaderPersistence` restores the scroll position on load — so the reader
 * sees a flicker rather than a jump. What does not survive is everything the
 * document accumulated since it loaded: chapters appended by infinite scroll are
 * thrown away and re-fetched, and the vocab marks and highlights painted over
 * them have to be pushed again.
 *
 * **Typography is deliberately NOT here.** Font size, line height, alignment and
 * family stay document inputs, so changing them still rebuilds. Two reasons:
 * the family needs its `@font-face` inlined at build time, and the other three
 * change line breaking — a rebuild plus the existing scroll restore is the
 * behaviour those settings already have, and re-anchoring a reading position
 * across a reflow is the position-model work, not this.
 */

export interface ReaderChrome {
  safeArea: { top: number; bottom: number }
  backgroundColor: string
  textColor: string
}

/** Horizontal page margin, and the extra breathing room above and below. */
const SIDE_PADDING = 16
const EDGE_PADDING = 16

function paddingValue(c: ReaderChrome): string {
  const top = (c.safeArea.top ?? 0) + EDGE_PADDING
  const bottom = (c.safeArea.bottom ?? 0) + EDGE_PADDING
  return `${top}px ${SIDE_PADDING}px ${bottom}px ${SIDE_PADDING}px`
}

/** CSS for a document being built. */
export function readerChromeCss(c: ReaderChrome): string {
  return `color: ${c.textColor};
      background: ${c.backgroundColor};
      padding: ${paddingValue(c)};`
}

/** The same values applied to a document already on screen. */
export function readerChromeInjectionJs(c: ReaderChrome): string {
  return `(function(){var b=document.body;if(!b)return;` +
    `b.style.padding=${JSON.stringify(paddingValue(c))};` +
    `b.style.background=${JSON.stringify(c.backgroundColor)};` +
    `b.style.color=${JSON.stringify(c.textColor)};` +
    `})()`
}

/**
 * The identity of a reflow document. Insets and colours are absent on purpose —
 * that absence is the fix, and an absence is what a reviewer stops seeing.
 */
export function readerDocumentKey(d: {
  chapterSlug: string
  fontFamily: string
  fontSize: number
  lineHeight: number
  textAlign: string
  overlayV2: boolean
  /** Length is enough to notice a different chapter without hashing it. */
  htmlLength: number
}): string {
  return [
    d.chapterSlug, d.fontFamily, String(d.fontSize), String(d.lineHeight),
    d.textAlign, d.overlayV2 ? 'v2' : 'v1', String(d.htmlLength),
  ].join(' ')
}

/** Insets latch to the largest seen — the top bar is an overlay that comes back. */
export function latchReaderChrome(prev: ReaderChrome | null, next: ReaderChrome): ReaderChrome {
  if (!prev) return next
  return {
    safeArea: {
      top: Math.max(prev.safeArea.top, next.safeArea.top),
      bottom: Math.max(prev.safeArea.bottom, next.safeArea.bottom),
    },
    backgroundColor: next.backgroundColor,
    textColor: next.textColor,
  }
}

export function readerChromeChanged(a: ReaderChrome | null, b: ReaderChrome): boolean {
  if (!a) return true
  return a.safeArea.top !== b.safeArea.top
    || a.safeArea.bottom !== b.safeArea.bottom
    || a.backgroundColor !== b.backgroundColor
    || a.textColor !== b.textColor
}
