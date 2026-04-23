import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  __resetSupportCache,
  clear,
  clearAll,
  isSupported,
  registerRanges,
  syncHighlights,
} from './customHighlightRegistry'
import { ACTIVE_HIGHLIGHT_NAME, HIGHLIGHT_NAMES } from './vocabHighlightEngine'
import { resetSink, setSink } from './vocabHighlightTelemetry'

// JSDOM does not implement CSS.highlights / Highlight — install a mock.
class MockHighlight {
  private ranges: Range[] = []
  get size(): number {
    return this.ranges.length
  }
  add(r: Range): void {
    this.ranges.push(r)
  }
  clear(): void {
    this.ranges = []
  }
}

function installMock() {
  const store = new Map<string, MockHighlight>()
  const registry = {
    set(name: string, h: MockHighlight) {
      store.set(name, h)
    },
    get(name: string): MockHighlight | undefined {
      return store.get(name)
    },
    has(name: string): boolean {
      return store.has(name)
    },
    delete(name: string): boolean {
      return store.delete(name)
    },
  }
  const g = globalThis as unknown as Record<string, unknown>
  g.CSS = { highlights: registry }
  g.Highlight = MockHighlight
  return { store, registry }
}

function uninstallMock() {
  const g = globalThis as unknown as Record<string, unknown>
  delete g.CSS
  delete g.Highlight
}

function mkRange(text: string): Range {
  const el = document.createElement('span')
  el.textContent = text
  document.body.appendChild(el)
  const r = document.createRange()
  r.selectNodeContents(el)
  return r
}

describe('customHighlightRegistry — unsupported environment', () => {
  beforeEach(() => {
    uninstallMock()
    __resetSupportCache()
  })

  afterEach(() => {
    uninstallMock()
    __resetSupportCache()
  })

  it('isSupported returns false without CSS.highlights', () => {
    expect(isSupported()).toBe(false)
  })

  it('registerRanges is a no-op (ok=false)', () => {
    const r = registerRanges(HIGHLIGHT_NAMES[0], [mkRange('a')])
    expect(r.ok).toBe(false)
    expect(r.registered).toBe(0)
  })

  it('clear/clearAll/syncHighlights are no-ops', () => {
    expect(clear(HIGHLIGHT_NAMES[0]).ok).toBe(false)
    expect(() => clearAll()).not.toThrow()
    expect(syncHighlights(new Map())).toBe(false)
  })

  it('detects constructor that throws by flagging unsupported', () => {
    const g = globalThis as unknown as Record<string, unknown>
    g.CSS = { highlights: { set() {}, get() {}, delete() { return false }, has() { return false } } }
    g.Highlight = function () {
      throw new Error('boom')
    }
    __resetSupportCache()
    expect(isSupported()).toBe(false)
  })

  it('flags unsupported when Highlight instance lacks add/clear', () => {
    const g = globalThis as unknown as Record<string, unknown>
    g.CSS = { highlights: { set() {}, get() {}, delete() { return false }, has() { return false } } }
    g.Highlight = function () {
      return {}
    }
    __resetSupportCache()
    expect(isSupported()).toBe(false)
  })
})

describe('customHighlightRegistry — supported environment', () => {
  let mock: ReturnType<typeof installMock>

  beforeEach(() => {
    mock = installMock()
    __resetSupportCache()
    resetSink()
  })

  afterEach(() => {
    uninstallMock()
    __resetSupportCache()
    resetSink()
    vi.restoreAllMocks()
  })

  it('feature detection caches result', () => {
    expect(isSupported()).toBe(true)
    expect(isSupported()).toBe(true)
  })

  it('registers a range under a named highlight', () => {
    const result = registerRanges(HIGHLIGHT_NAMES[0], [mkRange('x'), mkRange('y')])
    expect(result.ok).toBe(true)
    expect(result.registered).toBe(2)
    expect(mock.store.get(HIGHLIGHT_NAMES[0])?.size).toBe(2)
  })

  it('empty ranges clear the named highlight instead of writing an empty one', () => {
    registerRanges(HIGHLIGHT_NAMES[0], [mkRange('x')])
    expect(mock.store.has(HIGHLIGHT_NAMES[0])).toBe(true)
    const result = registerRanges(HIGHLIGHT_NAMES[0], [])
    expect(result.ok).toBe(true)
    expect(result.registered).toBe(0)
    expect(mock.store.has(HIGHLIGHT_NAMES[0])).toBe(false)
  })

  it('emits register.mismatch when post-register size differs from expected', () => {
    // Make add() drop ranges to force mismatch.
    const sink = vi.fn()
    setSink(sink)
    const g = globalThis as unknown as Record<string, unknown>
    g.Highlight = class {
      size = 0
      add() {
        // Intentionally drop — simulates partial registration
      }
      clear() {
        this.size = 0
      }
    }
    __resetSupportCache()
    registerRanges(HIGHLIGHT_NAMES[0], [mkRange('a')])
    const events = sink.mock.calls.map((c) => c[0])
    expect(events).toContain('register.mismatch')
  })

  it('register.error is emitted when set() throws', () => {
    const sink = vi.fn()
    setSink(sink)
    const g = globalThis as unknown as Record<string, unknown>
    g.CSS = {
      highlights: {
        set() {
          throw new Error('fail')
        },
        get() {
          return undefined
        },
        has() {
          return false
        },
        delete() {
          return false
        },
      },
    }
    __resetSupportCache()
    const result = registerRanges(HIGHLIGHT_NAMES[0], [mkRange('x')])
    expect(result.ok).toBe(false)
    expect(sink.mock.calls.map((c) => c[0])).toContain('register.error')
  })

  it('clear removes a registered highlight', () => {
    registerRanges(HIGHLIGHT_NAMES[1], [mkRange('x')])
    expect(mock.store.has(HIGHLIGHT_NAMES[1])).toBe(true)
    const res = clear(HIGHLIGHT_NAMES[1])
    expect(res.ok).toBe(true)
    expect(mock.store.has(HIGHLIGHT_NAMES[1])).toBe(false)
  })

  it('clear is a safe no-op when the highlight was never registered', () => {
    expect(clear('vocab-unknown').ok).toBe(true)
  })

  it('clear.error is emitted when delete() throws', () => {
    const sink = vi.fn()
    setSink(sink)
    const g = globalThis as unknown as Record<string, unknown>
    g.CSS = {
      highlights: {
        set() {},
        get() {
          return new MockHighlight()
        },
        has() {
          return true
        },
        delete() {
          throw new Error('boom')
        },
      },
    }
    __resetSupportCache()
    const res = clear(HIGHLIGHT_NAMES[0])
    expect(res.ok).toBe(false)
    expect(sink.mock.calls.map((c) => c[0])).toContain('clear.error')
  })

  it('clearAll removes every managed highlight name', () => {
    registerRanges(HIGHLIGHT_NAMES[0], [mkRange('a')])
    registerRanges(HIGHLIGHT_NAMES[2], [mkRange('b')])
    registerRanges(ACTIVE_HIGHLIGHT_NAME, [mkRange('c')])
    clearAll()
    expect(mock.store.has(HIGHLIGHT_NAMES[0])).toBe(false)
    expect(mock.store.has(HIGHLIGHT_NAMES[2])).toBe(false)
    expect(mock.store.has(ACTIVE_HIGHLIGHT_NAME)).toBe(false)
  })

  it('syncHighlights writes provided buckets and clears the rest', () => {
    registerRanges(HIGHLIGHT_NAMES[4], [mkRange('old')])
    const groups = new Map<string, Range[]>([
      [HIGHLIGHT_NAMES[0], [mkRange('a'), mkRange('b')]],
      [HIGHLIGHT_NAMES[3], [mkRange('c')]],
    ])
    const ok = syncHighlights(groups)
    expect(ok).toBe(true)
    expect(mock.store.get(HIGHLIGHT_NAMES[0])?.size).toBe(2)
    expect(mock.store.get(HIGHLIGHT_NAMES[3])?.size).toBe(1)
    expect(mock.store.has(HIGHLIGHT_NAMES[4])).toBe(false)
    expect(mock.store.has(ACTIVE_HIGHLIGHT_NAME)).toBe(false)
  })

  it('syncHighlights returns false if any register fails', () => {
    const g = globalThis as unknown as Record<string, unknown>
    const originalCss = g.CSS
    let calls = 0
    g.CSS = {
      highlights: {
        set() {
          calls++
          if (calls === 1) throw new Error('fail')
        },
        get() {
          return new MockHighlight()
        },
        has() {
          return false
        },
        delete() {
          return false
        },
      },
    }
    __resetSupportCache()
    const ok = syncHighlights(
      new Map([[HIGHLIGHT_NAMES[0], [mkRange('a')]]]),
    )
    expect(ok).toBe(false)
    g.CSS = originalCss
  })
})
