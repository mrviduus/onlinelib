import { useEffect, useRef } from 'react'
import type { VocabMap } from '../../hooks/useReaderVocabulary'
import { useContainerMutationObserver } from '../../hooks/useContainerMutationObserver'
import {
  computeVocabMatches,
  type ActiveBubbleSnapshot,
} from '../../lib/vocabHighlightEngine'
import { count } from '../../lib/vocabHighlightTelemetry'
import { normalizeVocabKey } from '../../lib/vocabKey'

interface VocabHighlightOracleProps {
  containerRef: React.RefObject<HTMLElement | null>
  vocabMap: VocabMap
  activeBubble?: ActiveBubbleSnapshot | null
}

// Shadow-mode oracle: runs the new engine against the same container the
// legacy VocabWordLayer just annotated, and reports any divergence via
// telemetry. Renders nothing — pure observer. Enabled by feature flag.
export function VocabHighlightOracle({
  containerRef,
  vocabMap,
  activeBubble = null,
}: VocabHighlightOracleProps) {
  const lastSignatureRef = useRef<string>('')

  const compare = () => {
    const container = containerRef.current
    if (!container) return

    const engineMatches = computeVocabMatches(container, {
      vocabMap,
      activeBubble,
    })
    const engineKeys: string[] = []
    for (const m of engineMatches) engineKeys.push(m.key)

    const marks = container.querySelectorAll('mark[data-vocab-mark]')
    const legacyKeys: string[] = []
    marks.forEach((mark) => {
      const firstChild = mark.firstChild
      const word = firstChild?.nodeType === Node.TEXT_NODE ? firstChild.textContent : mark.textContent
      if (word) legacyKeys.push(normalizeVocabKey(word))
    })

    const engineSorted = [...engineKeys].sort()
    const legacySorted = [...legacyKeys].sort()
    const signature = `${engineSorted.length}|${legacySorted.length}|${engineSorted.join(',')}|${legacySorted.join(',')}`
    if (signature === lastSignatureRef.current) return
    lastSignatureRef.current = signature

    if (engineSorted.length !== legacySorted.length) {
      count('oracle.diff', {
        kind: 'count',
        engine: engineSorted.length,
        legacy: legacySorted.length,
      })
      return
    }
    for (let i = 0; i < engineSorted.length; i++) {
      if (engineSorted[i] !== legacySorted[i]) {
        count('oracle.diff', {
          kind: 'keys',
          missingFromLegacy: diff(engineSorted, legacySorted),
          missingFromEngine: diff(legacySorted, engineSorted),
        })
        return
      }
    }
  }

  useEffect(compare, [containerRef, vocabMap, activeBubble])
  useContainerMutationObserver(containerRef, compare)

  return null
}

function diff(a: readonly string[], b: readonly string[]): string[] {
  const bSet = new Set(b)
  return a.filter((x) => !bSet.has(x))
}
