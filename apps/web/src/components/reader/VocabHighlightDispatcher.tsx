import { useEffect, useMemo, useRef, useState } from 'react'
import type { VocabMap } from '../../hooks/useReaderVocabulary'
import { FEATURES, isRuntimeKillswitchSet, isReaderOverlayV2Active } from '../../lib/features'
import { isSupported as isCustomHighlightSupported } from '../../lib/customHighlightRegistry'
import { count } from '../../lib/vocabHighlightTelemetry'
import type { ActiveBubbleSnapshot } from '../../lib/vocabHighlightEngine'
import { VocabWordLayer } from './VocabWordLayer'
import { VocabHighlightLayer } from './VocabHighlightLayer'
import { VocabOverlayLayer } from './VocabOverlayLayer'
import { VocabHighlightErrorBoundary } from './VocabHighlightErrorBoundary'
import { VocabHighlightOracle } from './VocabHighlightOracle'

interface VocabHighlightDispatcherProps {
  containerRef: React.RefObject<HTMLElement | null>
  vocabMap: VocabMap
  showInlineTranslations?: boolean
  activeBubble?: ActiveBubbleSnapshot | null
  chapterId?: string
}

type Decision = 'overlay' | 'new' | 'legacy'

function decide(): { decision: Decision; reason: string } {
  if (isReaderOverlayV2Active()) {
    return { decision: 'overlay', reason: 'reader_overlay_v2' }
  }
  if (!FEATURES.customVocabHighlights) return { decision: 'legacy', reason: 'flag_off' }
  if (isRuntimeKillswitchSet()) return { decision: 'legacy', reason: 'killswitch' }
  if (!isCustomHighlightSupported()) return { decision: 'legacy', reason: 'unsupported' }
  return { decision: 'new', reason: 'supported' }
}

// Picks the vocab-highlight implementation per render:
//   - new: CSS Custom Highlight API layer, wrapped in an ErrorBoundary that
//          falls back to the legacy layer on throw.
//   - legacy: imperative VocabWordLayer (pre-refactor path).
//
// Emits boot telemetry exactly once per mount so we can track fallback
// rate in prod. Oracle mode additionally mounts the legacy layer plus a
// shadow observer, independent of which path is visibly active.
export function VocabHighlightDispatcher({
  containerRef,
  vocabMap,
  showInlineTranslations = false,
  activeBubble = null,
  chapterId,
}: VocabHighlightDispatcherProps) {
  const [bootLogged, setBootLogged] = useState(false)
  const initialDecision = useMemo(decide, [])
  const decisionRef = useRef(initialDecision)
  const oracleEnabled = FEATURES.vocabHighlightsOracle

  useEffect(() => {
    if (bootLogged) return
    const { decision, reason } = decisionRef.current
    if (decision === 'overlay') count('boot.overlay', { reason })
    else if (decision === 'new') count('boot.supported', { reason })
    else count('boot.fallback', { reason })
    setBootLogged(true)
  }, [bootLogged])

  const legacyLayer = (
    <VocabWordLayer
      containerRef={containerRef}
      vocabMap={vocabMap}
      showInlineTranslations={showInlineTranslations}
      activeBubble={activeBubble}
    />
  )

  const oracle = oracleEnabled ? (
    <VocabHighlightOracle
      containerRef={containerRef}
      vocabMap={vocabMap}
      activeBubble={activeBubble}
    />
  ) : null

  if (decisionRef.current.decision === 'legacy') {
    return (
      <>
        {legacyLayer}
        {oracle}
      </>
    )
  }

  if (decisionRef.current.decision === 'overlay') {
    return (
      <>
        <VocabHighlightErrorBoundary fallback={legacyLayer} resetKey={chapterId}>
          <VocabOverlayLayer
            containerRef={containerRef}
            vocabMap={vocabMap}
            showInlineTranslations={showInlineTranslations}
            activeBubble={activeBubble}
          />
        </VocabHighlightErrorBoundary>
        {oracle}
      </>
    )
  }

  return (
    <>
      <VocabHighlightErrorBoundary fallback={legacyLayer} resetKey={chapterId}>
        <VocabHighlightLayer
          containerRef={containerRef}
          vocabMap={vocabMap}
          showInlineTranslations={showInlineTranslations}
          activeBubble={activeBubble}
        />
      </VocabHighlightErrorBoundary>
      {oracle}
    </>
  )
}
