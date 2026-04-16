import { useMemo } from 'react'
import type { WordTimestamp } from '../../api/tts'

interface TtsHighlightOverlayProps {
  text: string
  timestamps: WordTimestamp[]
  currentWordIndex: number
  visible: boolean
  onStop: () => void
}

type Span =
  | { kind: 'word'; idx: number; value: string }
  | { kind: 'gap'; value: string }

// Splits the source text the same way Edge TTS's WordBoundary events carve it
// up, so each span maps to exactly one timestamp entry. Timestamps arrive
// AFTER audio decode starts, so during the leading frames we render the raw
// text with no spans (no highlight). Once timestamps land we switch to span
// mode — the first highlight fires on the first rAF tick past ts[0].startMs.
//
// Matching strategy: walk the text left-to-right, greedily consuming each
// timestamp's `word` literal (whitespace-tolerant). Edge TTS emits words as
// they appear in the SSML, including punctuation attached or not depending on
// voice — we can't assume `text.split(/\s+/)[i] === timestamps[i].word`. The
// greedy walker stays robust to that and to occasional Unicode normalization
// differences.
function buildSpans(text: string, ts: WordTimestamp[]): Span[] {
  if (ts.length === 0) return [{ kind: 'gap', value: text }]
  const out: Span[] = []
  let cursor = 0
  for (let i = 0; i < ts.length; i++) {
    const word = ts[i].word
    const found = text.indexOf(word, cursor)
    if (found < 0) {
      // Fallback: word not found past cursor — emit as synthetic word span so
      // indices still line up with the highlight ticker. Visual gap if any
      // remaining text won't be assigned to any word.
      out.push({ kind: 'word', idx: i, value: word })
      continue
    }
    if (found > cursor) out.push({ kind: 'gap', value: text.slice(cursor, found) })
    out.push({ kind: 'word', idx: i, value: word })
    cursor = found + word.length
  }
  if (cursor < text.length) out.push({ kind: 'gap', value: text.slice(cursor) })
  return out
}

export function TtsHighlightOverlay({ text, timestamps, currentWordIndex, visible, onStop }: TtsHighlightOverlayProps) {
  const spans = useMemo(() => buildSpans(text, timestamps), [text, timestamps])

  if (!visible) return null

  return (
    <div className="tts-highlight-overlay" role="status" aria-live="polite">
      <div className="tts-highlight-overlay__text">
        {spans.map((s, i) =>
          s.kind === 'gap' ? (
            <span key={i} className="tts-highlight-overlay__gap">{s.value}</span>
          ) : (
            <span
              key={i}
              className={
                s.idx === currentWordIndex
                  ? 'tts-highlight-overlay__word tts-highlight-overlay__word--active'
                  : 'tts-highlight-overlay__word'
              }
            >
              {s.value}
            </span>
          ),
        )}
      </div>
      <button
        type="button"
        className="tts-highlight-overlay__stop"
        onClick={onStop}
        aria-label="Stop playback"
      >
        <span className="material-icons-outlined">stop</span>
      </button>
    </div>
  )
}
