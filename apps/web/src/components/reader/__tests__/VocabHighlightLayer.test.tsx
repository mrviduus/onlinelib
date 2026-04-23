import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import { useRef } from 'react'
import type { VocabMap } from '../../../hooks/useReaderVocabulary'
import { VocabHighlightLayer } from '../VocabHighlightLayer'
import { __resetSupportCache } from '../../../lib/customHighlightRegistry'
import { ACTIVE_HIGHLIGHT_NAME, HIGHLIGHT_NAMES } from '../../../lib/vocabHighlightEngine'

// --- CSS.highlights mock (same shape as the registry test) ---
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
  const registry = {
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
  }
  const g = globalThis as unknown as Record<string, unknown>
  g.CSS = { highlights: registry }
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
  activeBubble,
  showInlineTranslations,
  killSwitch,
}: {
  html: string
  vocabMap: VocabMap
  activeBubble?: { word: string; translation: string | null } | null
  showInlineTranslations?: boolean
  killSwitch?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <>
      <div ref={ref} dangerouslySetInnerHTML={{ __html: html }} />
      <VocabHighlightLayer
        containerRef={ref}
        vocabMap={vocabMap}
        activeBubble={activeBubble}
        showInlineTranslations={showInlineTranslations}
        killSwitch={killSwitch}
      />
    </>
  )
}

const mkMap = (entries: Array<[string, { stage: number; translation?: string }]>) =>
  new Map(entries.map(([k, v]) => [k, { stage: v.stage, translation: v.translation }])) as VocabMap

describe('VocabHighlightLayer', () => {
  let store: ReturnType<typeof installMock>

  beforeEach(() => {
    store = installMock()
    __resetSupportCache()
  })

  afterEach(() => {
    uninstallMock()
    __resetSupportCache()
    vi.restoreAllMocks()
  })

  it('registers ranges under the stage-specific highlight on mount', async () => {
    render(
      <Host
        html="<p>The quick brown fox.</p>"
        vocabMap={mkMap([['fox', { stage: 2 }]])}
      />,
    )
    await waitFor(() => {
      expect(store.get(HIGHLIGHT_NAMES[2])?.size).toBe(1)
    })
  })

  it('also registers the active-bubble word when not yet saved', async () => {
    render(
      <Host
        html="<p>learning new skills</p>"
        vocabMap={new Map()}
        activeBubble={{ word: 'learning', translation: 't' }}
      />,
    )
    await waitFor(() => {
      expect(store.get(ACTIVE_HIGHLIGHT_NAME)?.size).toBe(1)
    })
  })

  it('recovers after innerHTML replacement via mutation observer', async () => {
    function SwappingHost() {
      const ref = useRef<HTMLDivElement>(null)
      return (
        <>
          <div
            ref={ref}
            data-test="chapter"
            dangerouslySetInnerHTML={{ __html: '<p>fox one</p>' }}
          />
          <VocabHighlightLayer
            containerRef={ref}
            vocabMap={mkMap([['fox', { stage: 0 }]])}
          />
          <button
            onClick={() => {
              if (ref.current) ref.current.innerHTML = '<p>another fox appears</p>'
            }}
          >
            swap
          </button>
        </>
      )
    }
    const { getByText, container } = render(<SwappingHost />)
    await waitFor(() => {
      expect(store.get(HIGHLIGHT_NAMES[0])?.size).toBe(1)
    })

    // Force remount of chapter HTML (reproduces useScrollReader eviction).
    act(() => {
      getByText('swap').click()
    })

    await waitFor(() => {
      const size = store.get(HIGHLIGHT_NAMES[0])?.size ?? 0
      expect(size).toBeGreaterThan(0)
    })
    expect(container).toBeTruthy()
  })

  it('clears all highlights on unmount', async () => {
    const { unmount } = render(
      <Host html="<p>fox</p>" vocabMap={mkMap([['fox', { stage: 0 }]])} />,
    )
    await waitFor(() => expect(store.get(HIGHLIGHT_NAMES[0])?.size).toBe(1))
    unmount()
    expect(store.has(HIGHLIGHT_NAMES[0])).toBe(false)
  })

  it('renders no overlay items when showInlineTranslations is false', () => {
    const { container } = render(
      <Host
        html="<p>fox</p>"
        vocabMap={mkMap([['fox', { stage: 0, translation: 'лиса' }]])}
        showInlineTranslations={false}
      />,
    )
    expect(container.querySelector('.vocab-translation-overlay')).toBeNull()
  })

  it('renders overlay when showInlineTranslations=true', async () => {
    // Stub Range#getBoundingClientRect so the overlay actually places items.
    const origCreateRange = document.createRange.bind(document)
    document.createRange = () => {
      const r = origCreateRange()
      r.getBoundingClientRect = () =>
        ({ left: 10, top: 10, width: 20, height: 10, right: 30, bottom: 20, x: 10, y: 10, toJSON: () => ({}) }) as DOMRect
      return r
    }
    try {
      const { container } = render(
        <Host
          html="<p>fox jumps high</p>"
          vocabMap={mkMap([['fox', { stage: 0, translation: 'лиса' }]])}
          showInlineTranslations={true}
        />,
      )
      await waitFor(() => {
        expect(container.querySelector('.vocab-translation-overlay__item')).toBeTruthy()
      })
    } finally {
      document.createRange = origCreateRange
    }
  })

  it('kill-switch renders nothing and wipes registered highlights', async () => {
    const { rerender } = render(
      <Host html="<p>fox</p>" vocabMap={mkMap([['fox', { stage: 0 }]])} />,
    )
    await waitFor(() => expect(store.get(HIGHLIGHT_NAMES[0])?.size).toBe(1))

    rerender(
      <Host html="<p>fox</p>" vocabMap={mkMap([['fox', { stage: 0 }]])} killSwitch={true} />,
    )

    await waitFor(() => {
      expect(store.has(HIGHLIGHT_NAMES[0])).toBe(false)
    })
  })

  it('no-ops entirely when isSupported() is false', async () => {
    uninstallMock()
    __resetSupportCache()
    const { container } = render(
      <Host html="<p>fox</p>" vocabMap={mkMap([['fox', { stage: 0 }]])} />,
    )
    // No throw, no registration calls, nothing mutated in the document.
    expect(container.querySelector('[data-vocab-overlay]')).toBeNull()
  })
})
