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

// Walk text nodes → for each tokenized word that's in vocabMap (or is the
// active bubble), create a Range covering just that word.
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

  for (const textNode of textNodes) {
    const text = textNode.data
    if (!text || !text.trim()) continue

    const tokens = tokenizeVocabWords(text)
    if (tokens.length === 0) continue

    for (const tok of tokens) {
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
