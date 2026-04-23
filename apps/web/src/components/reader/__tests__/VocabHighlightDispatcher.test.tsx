import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { useRef } from 'react'
import type { VocabMap } from '../../../hooks/useReaderVocabulary'

// Mock features module so we can drive flag state per-test.
const flagState = {
  customVocabHighlights: true,
  vocabHighlightsOracle: false,
  readerOverlayV2: false,
}
let killswitch = false
let overlayV2Active = false

vi.mock('../../../lib/features', () => ({
  get FEATURES() {
    return flagState
  },
  isRuntimeKillswitchSet: () => killswitch,
  isReaderOverlayKillswitchSet: () => false,
  isReaderOverlayRuntimeEnabled: () => false,
  isReaderOverlayV2Active: () => overlayV2Active,
}))

// Import AFTER the mock is in place.
import { VocabHighlightDispatcher } from '../VocabHighlightDispatcher'
import { __resetSupportCache } from '../../../lib/customHighlightRegistry'
import { resetSink, setSink } from '../../../lib/vocabHighlightTelemetry'

// --- CSS.highlights mock ---
class MockHighlight {
  private ranges: Range[] = []
  get size() {
    return this.ranges.length
  }
  add(r: Range) {
    this.ranges.push(r)
  }
  clear() {
    this.ranges = []
  }
}
function installMock() {
  const store = new Map<string, MockHighlight>()
  const g = globalThis as unknown as Record<string, unknown>
  g.CSS = {
    highlights: {
      set(name: string, h: MockHighlight) {
        store.set(name, h)
      },
      get(name: string) {
        return store.get(name)
      },
      has(name: string) {
        return store.has(name)
      },
      delete(name: string) {
        return store.delete(name)
      },
    },
  }
  g.Highlight = MockHighlight
  return store
}
function uninstallMock() {
  const g = globalThis as unknown as Record<string, unknown>
  delete g.CSS
  delete g.Highlight
}

function Host({
  html,
  vocabMap,
}: {
  html: string
  vocabMap: VocabMap
}) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <>
      <div ref={ref} data-host dangerouslySetInnerHTML={{ __html: html }} />
      <VocabHighlightDispatcher containerRef={ref} vocabMap={vocabMap} chapterId="ch-1" />
    </>
  )
}

const mkMap = (entries: Array<[string, { stage: number }]>) =>
  new Map(entries.map(([k, v]) => [k, { stage: v.stage }])) as VocabMap

describe('VocabHighlightDispatcher', () => {
  beforeEach(() => {
    flagState.customVocabHighlights = true
    flagState.vocabHighlightsOracle = false
    flagState.readerOverlayV2 = false
    killswitch = false
    overlayV2Active = false
    installMock()
    __resetSupportCache()
    resetSink()
  })

  afterEach(() => {
    uninstallMock()
    __resetSupportCache()
    resetSink()
    vi.restoreAllMocks()
  })

  it('picks the new layer when supported + flag on', async () => {
    const sink = vi.fn()
    setSink(sink)
    const { container } = render(
      <Host html="<p>the fox</p>" vocabMap={mkMap([['fox', { stage: 0 }]])} />,
    )
    // Legacy renders <mark data-vocab-mark>; new layer does NOT.
    await waitFor(() => {
      const bootEvents = sink.mock.calls.map((c) => c[0])
      expect(bootEvents).toContain('boot.supported')
    })
    expect(container.querySelector('mark[data-vocab-mark]')).toBeNull()
  })

  it('falls back to legacy when the flag is off', async () => {
    flagState.customVocabHighlights = false
    const sink = vi.fn()
    setSink(sink)
    const { container } = render(
      <Host html="<p>the fox</p>" vocabMap={mkMap([['fox', { stage: 0 }]])} />,
    )
    await waitFor(() => {
      expect(container.querySelector('mark[data-vocab-mark]')).toBeTruthy()
    })
    const events = sink.mock.calls.map((c) => c[0])
    expect(events).toContain('boot.fallback')
  })

  it('falls back when the runtime killswitch is set', async () => {
    killswitch = true
    const sink = vi.fn()
    setSink(sink)
    const { container } = render(
      <Host html="<p>the fox</p>" vocabMap={mkMap([['fox', { stage: 0 }]])} />,
    )
    await waitFor(() => {
      expect(container.querySelector('mark[data-vocab-mark]')).toBeTruthy()
    })
    const reasons = sink.mock.calls.map((c) => c[1]?.reason)
    expect(reasons).toContain('killswitch')
  })

  it('falls back when CSS.highlights is unsupported', async () => {
    uninstallMock()
    __resetSupportCache()
    const sink = vi.fn()
    setSink(sink)
    const { container } = render(
      <Host html="<p>the fox</p>" vocabMap={mkMap([['fox', { stage: 0 }]])} />,
    )
    await waitFor(() => {
      expect(container.querySelector('mark[data-vocab-mark]')).toBeTruthy()
    })
    const reasons = sink.mock.calls.map((c) => c[1]?.reason)
    expect(reasons).toContain('unsupported')
  })

  it('oracle mode: mounts the oracle when flag is set', async () => {
    flagState.vocabHighlightsOracle = true
    render(<Host html="<p>the fox</p>" vocabMap={mkMap([['fox', { stage: 0 }]])} />)
    // Oracle has no visible DOM; presence verified indirectly in its own test.
    // Here we just check that a render with oracle-on doesn't throw.
    await new Promise((r) => setTimeout(r, 10))
  })
})
