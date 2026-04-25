// Pure engine: compute Range[] per SRS stage for vocab words inside a container.
// Zero DOM mutation. Consumer feeds ranges to customHighlightRegistry.
//
// Reuses tokenize/normalize from vocabKey to stay consistent with save-flow.

import type { VocabMap } from '../hooks/useReaderVocabulary'
import { normalizeVocabKey, tokenizeVocabWords } from './vocabKey'

export interface ActiveBubbleSnapshot {
  word: string
  translation: string | null
}

export interface WordMatch {
  key: string
  word: string
  stage: number
  translation: string | null
  range: Range
  isActive: boolean
}

// Highlight-name per stage. These map 1:1 to ::highlight() pseudo-selectors
// in the reader stylesheet and MUST match customHighlightRegistry clearAll.
export const HIGHLIGHT_NAMES: Record<number, string> = {
  0: 'vocab-new',
  1: 'vocab-recognition',
  2: 'vocab-recall',
  3: 'vocab-context',
  4: 'vocab-mastered',
}

// Unsaved word currently previewed in activeBubble uses its own highlight name,
// so we can clear just the preview without touching saved words.
export const ACTIVE_HIGHLIGHT_NAME = 'vocab-active'

export const ALL_HIGHLIGHT_NAMES: readonly string[] = [
  ...Object.values(HIGHLIGHT_NAMES),
  ACTIVE_HIGHLIGHT_NAME,
]

export function highlightNameForStage(stage: number): string {
  return HIGHLIGHT_NAMES[stage] ?? HIGHLIGHT_NAMES[0]
}

// Skip content that must not be underlined: <script>, <style>, nested matches,
// and the overlay layer itself (we'll tag it with data-vocab-overlay).
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT'])

function shouldSkipTextNode(node: Text): boolean {
  const parent = node.parentElement
  if (!parent) return true
  if (SKIP_TAGS.has(parent.tagName)) return true
  if (parent.closest('[data-vocab-overlay]')) return true
  return false
}

function collectTextNodes(root: Node): Text[] {
  const walker = (root.ownerDocument ?? document).createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(n) {
        return shouldSkipTextNode(n as Text) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
      },
    },
  )
  const nodes: Text[] = []
  let cur: Node | null
  while ((cur = walker.nextNode())) nodes.push(cur as Text)
  return nodes
}

export interface ComputeOptions {
  vocabMap: VocabMap
  activeBubble?: ActiveBubbleSnapshot | null
}

// Word-boundary char class — matches the unicode set tokenizeVocabWords uses,
// so phrase boundaries align with single-token boundaries (no overlap surprises).
const WORDCHAR_RE = /[\p{L}\p{M}\p{N}]/u

// Walk text nodes → for each tokenized word that's in vocabMap (or is the
// active bubble), create a Range covering just that word. Multi-word phrase
// keys (those containing whitespace) match first via case-insensitive
// substring scan, longest-first; the single-token pass skips any indices
// already claimed by a phrase so "make sense" never double-matches as
// "make" + "sense".
export function computeVocabMatches(
  container: Node | null | undefined,
  { vocabMap, activeBubble }: ComputeOptions,
): WordMatch[] {
  if (!container) return []
  if (vocabMap.size === 0 && !activeBubble) return []

  const doc = container.ownerDocument ?? document
  const activeKey =
    activeBubble && activeBubble.word ? normalizeVocabKey(activeBubble.word) : null
  const matches: WordMatch[] = []
  const textNodes = collectTextNodes(container)

  // Split keys into single-token vs phrase. Phrases sorted longest-first so
  // "in spite of" claims its span before "spite" can short-match.
  const phraseKeys: { key: string; entry: { stage: number; translation?: string | null } }[] = []
  for (const [k, v] of vocabMap.entries()) {
    if (k.indexOf(' ') !== -1) phraseKeys.push({ key: k, entry: v })
  }
  phraseKeys.sort((a, b) => b.key.length - a.key.length)

  for (const textNode of textNodes) {
    const text = textNode.data
    if (!text || !text.trim()) continue

    const lower = text.normalize('NFC').toLowerCase()
    const occupied: Uint8Array | null =
      phraseKeys.length > 0 ? new Uint8Array(text.length) : null

    if (occupied) {
      for (const phr of phraseKeys) {
        let search = 0
        while (search <= lower.length - phr.key.length) {
          const idx = lower.indexOf(phr.key, search)
          if (idx === -1) break
          const endIdx = idx + phr.key.length
          const beforeOk = idx === 0 || !WORDCHAR_RE.test(text.charAt(idx - 1))
          const afterOk = endIdx >= text.length || !WORDCHAR_RE.test(text.charAt(endIdx))
          if (beforeOk && afterOk) {
            let collide = false
            for (let i = idx; i < endIdx; i++) {
              if (occupied[i]) { collide = true; break }
            }
            if (!collide) {
              const range = doc.createRange()
              try {
                range.setStart(textNode, idx)
                range.setEnd(textNode, endIdx)
                matches.push({
                  key: phr.key,
                  word: text.slice(idx, endIdx),
                  stage: phr.entry.stage,
                  translation: phr.entry.translation ?? null,
                  range,
                  isActive: false,
                })
                for (let i = idx; i < endIdx; i++) occupied[i] = 1
              } catch {
                // setStart/setEnd may throw if the text node was mutated mid-walk.
                // Skip this match and continue — the next call will retry.
              }
            }
          }
          search = idx + 1
        }
      }
    }

    const tokens = tokenizeVocabWords(text)
    if (tokens.length === 0) continue

    for (const tok of tokens) {
      if (occupied && occupied[tok.start]) continue
      const key = normalizeVocabKey(tok.word)
      const entry = vocabMap.get(key)
      const isActive = !entry && activeKey !== null && key === activeKey
      if (!entry && !isActive) continue

      const range = doc.createRange()
      range.setStart(textNode, tok.start)
      range.setEnd(textNode, tok.end)

      matches.push({
        key,
        word: tok.word,
        stage: entry?.stage ?? 0,
        translation: entry?.translation ?? (isActive ? activeBubble!.translation : null),
        range,
        isActive,
      })
    }
  }

  return matches
}

// Bucket matches by highlight-name so the registry can register one Highlight
// per CSS pseudo. Buckets for highlights with no matches are omitted.
export function groupByHighlight(matches: readonly WordMatch[]): Map<string, Range[]> {
  const groups = new Map<string, Range[]>()
  for (const m of matches) {
    const name = m.isActive ? ACTIVE_HIGHLIGHT_NAME : highlightNameForStage(m.stage)
    const bucket = groups.get(name)
    if (bucket) bucket.push(m.range)
    else groups.set(name, [m.range])
  }
  return groups
}
