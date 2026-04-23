import { useCallback, useEffect, useMemo, useState } from 'react'
import type { VocabMap } from '../../hooks/useReaderVocabulary'
import { useContainerMutationObserver } from '../../hooks/useContainerMutationObserver'
import {
  computeVocabMatches,
  groupByHighlight,
  type ActiveBubbleSnapshot,
  type WordMatch,
} from '../../lib/vocabHighlightEngine'
import {
  clearAll as clearAllHighlights,
  isSupported,
  syncHighlights,
} from '../../lib/customHighlightRegistry'
import { count } from '../../lib/vocabHighlightTelemetry'
import { VocabTranslationOverlay } from './VocabTranslationOverlay'

export interface VocabHighlightLayerProps {
  containerRef: React.RefObject<HTMLElement | null>
  vocabMap: VocabMap
  showInlineTranslations?: boolean
  activeBubble?: ActiveBubbleSnapshot | null
  // Optional runtime killswitch. When true, layer renders nothing and skips
  // all registry work — parent is expected to fall back to legacy path.
  killSwitch?: boolean
}

// Declarative replacement for VocabWordLayer. Zero DOM mutation inside the
// chapter HTML — uses the CSS Custom Highlight API for underlines and a
// React-managed overlay for translations.
//
// Consumers MUST fall back to the legacy VocabWordLayer when
// `isSupported() === false` (see ReaderHighlights integration in slice 4).
export function VocabHighlightLayer({
  containerRef,
  vocabMap,
  showInlineTranslations = false,
  activeBubble = null,
  killSwitch = false,
}: VocabHighlightLayerProps) {
  const [matches, setMatches] = useState<readonly WordMatch[]>([])

  // Memoize the active bubble payload by its fields so a same-shape object
  // from parent re-render doesn't force a recompute.
  const activeKey = activeBubble?.word ?? null
  const activeTr = activeBubble?.translation ?? null
  const activeBubbleStable = useMemo<ActiveBubbleSnapshot | null>(
    () => (activeKey ? { word: activeKey, translation: activeTr } : null),
    [activeKey, activeTr],
  )

  const recompute = useCallback(() => {
    if (killSwitch) return
    const container = containerRef.current
    if (!container) return
    try {
      const next = computeVocabMatches(container, {
        vocabMap,
        activeBubble: activeBubbleStable,
      })
      setMatches(next)
    } catch (err) {
      count('error.engine', { error: err instanceof Error ? err.message : String(err) })
      setMatches([])
    }
  }, [containerRef, vocabMap, activeBubbleStable, killSwitch])

  // Recompute whenever inputs change OR the engine can't assume the DOM is stable.
  useEffect(() => {
    if (killSwitch) {
      setMatches([])
      return
    }
    recompute()
  }, [recompute, killSwitch])

  // Auto-recover after ReaderContent's dangerouslySetInnerHTML wipes the
  // chapter. Without this, the old imperative layer silently lost its marks.
  useContainerMutationObserver(containerRef, () => {
    count('mutation.recover')
    recompute()
  })

  // Push ranges into the registry whenever matches change. Clear on unmount
  // so stale highlights don't bleed into the next reader session.
  useEffect(() => {
    if (killSwitch) {
      clearAllHighlights()
      return
    }
    if (!isSupported()) return
    const groups = groupByHighlight(matches)
    syncHighlights(groups)
  }, [matches, killSwitch])

  useEffect(() => {
    return () => clearAllHighlights()
  }, [])

  if (killSwitch) return null

  return (
    <VocabTranslationOverlay
      matches={matches}
      visible={showInlineTranslations}
    />
  )
}
