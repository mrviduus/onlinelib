// Sentence splitter + word tokenizer for Focus Mode reader.
// Uses Intl.Segmenter when available (Chrome 87+, Safari 14.1+, FF 125+) for
// locale-aware splitting that handles abbreviations ("Mr. Smith") correctly.
// Falls back to regex when Segmenter is missing (e.g. Hermes / React Native).

export function splitSentences(text: string, locale = 'en'): string[] {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  if (!trimmed) return []

  // Intl.Segmenter path (preferred). Not in ES2020 lib, so typed locally.
  interface SegmenterCtor {
    new (locale: string, opts: { granularity: 'sentence' | 'word' | 'grapheme' }): {
      segment(s: string): Iterable<{ segment: string }>
    }
  }
  const Segmenter = (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter
  if (Segmenter) {
    try {
      const seg = new Segmenter(locale, { granularity: 'sentence' })
      const out: string[] = []
      for (const s of seg.segment(trimmed)) {
        const t = s.segment.trim()
        if (t) out.push(t)
      }
      return out
    } catch {
      // fall through to regex
    }
  }

  // Regex fallback — naive; does not handle abbreviations.
  const matches = trimmed.match(/[^.!?…]+[.!?…]+["')\]]*/gu)
  if (!matches) return [trimmed]
  return matches.map((s) => s.trim()).filter(Boolean)
}

export interface WordToken {
  word: string
  trailing: string // punctuation + whitespace that follows the word
}

// Tokenize a sentence into word + trailing-punctuation pairs so each word
// stays independently tappable while preserving original spacing/punct.
export function tokenizeWords(sentence: string): WordToken[] {
  const tokens: WordToken[] = []
  // Unicode letters/marks/numbers + apostrophes/hyphens inside a word.
  const re = /([\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}'’\-]*)([^\p{L}\p{M}\p{N}]*)/gu
  let m: RegExpExecArray | null
  while ((m = re.exec(sentence)) !== null) {
    if (!m[1]) continue
    tokens.push({ word: m[1], trailing: m[2] ?? '' })
  }
  return tokens
}
