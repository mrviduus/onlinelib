import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { useRef } from 'react'
import { VocabHighlightOracle } from '../VocabHighlightOracle'
import { resetSink, setSink } from '../../../lib/vocabHighlightTelemetry'
import type { VocabMap } from '../../../hooks/useReaderVocabulary'

function Harness({
  html,
  vocabMap,
}: {
  html: string
  vocabMap: VocabMap
}) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <>
      <div ref={ref} dangerouslySetInnerHTML={{ __html: html }} />
      <VocabHighlightOracle containerRef={ref} vocabMap={vocabMap} />
    </>
  )
}

const mkMap = (entries: Array<[string, { stage: number; translation?: string }]>) =>
  new Map(entries.map(([k, v]) => [k, { stage: v.stage, translation: v.translation }])) as VocabMap

describe('VocabHighlightOracle', () => {
  beforeEach(() => {
    resetSink()
  })

  afterEach(() => {
    resetSink()
    vi.restoreAllMocks()
  })

  it('logs no diff when legacy <mark> count matches engine matches', async () => {
    const sink = vi.fn()
    setSink(sink)
    // Manually mimic legacy marks.
    render(
      <Harness
        html='<p>The <mark data-vocab-mark="true">fox</mark> runs.</p>'
        vocabMap={mkMap([['fox', { stage: 0 }]])}
      />,
    )
    // Flush effects
    await new Promise((r) => setTimeout(r, 20))
    const diffs = sink.mock.calls.filter((c) => c[0] === 'oracle.diff')
    expect(diffs).toHaveLength(0)
  })

  it('logs oracle.diff when counts differ', async () => {
    const sink = vi.fn()
    setSink(sink)
    // Legacy has 0 marks; engine finds 1 match for fox.
    render(
      <Harness html="<p>fox runs</p>" vocabMap={mkMap([['fox', { stage: 0 }]])} />,
    )
    await waitFor(() => {
      const diffs = sink.mock.calls.filter((c) => c[0] === 'oracle.diff')
      expect(diffs.length).toBeGreaterThan(0)
    })
    const diff = sink.mock.calls.find((c) => c[0] === 'oracle.diff')
    expect(diff?.[1]?.engine).toBe(1)
    expect(diff?.[1]?.legacy).toBe(0)
  })

  it('does not re-log the same diff signature twice in a row', async () => {
    const sink = vi.fn()
    setSink(sink)
    const { rerender } = render(
      <Harness html="<p>fox runs</p>" vocabMap={mkMap([['fox', { stage: 0 }]])} />,
    )
    await waitFor(() => {
      expect(sink.mock.calls.some((c) => c[0] === 'oracle.diff')).toBe(true)
    })
    const before = sink.mock.calls.filter((c) => c[0] === 'oracle.diff').length
    rerender(<Harness html="<p>fox runs</p>" vocabMap={mkMap([['fox', { stage: 0 }]])} />)
    await new Promise((r) => setTimeout(r, 30))
    const after = sink.mock.calls.filter((c) => c[0] === 'oracle.diff').length
    expect(after).toBe(before)
  })

  it('renders nothing visible', () => {
    const { container } = render(
      <Harness html="<p>fox</p>" vocabMap={mkMap([['fox', { stage: 0 }]])} />,
    )
    const oracleEl = container.querySelector('[data-vocab-oracle]')
    expect(oracleEl).toBeNull()
  })
})
