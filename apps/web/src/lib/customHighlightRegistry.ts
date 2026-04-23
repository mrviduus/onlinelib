// Thin wrapper over the CSS Custom Highlight API.
// Feature-detects, registers Range[] under named highlights, never throws
// out. All failures route to telemetry and return a soft boolean.
//
// Browser support (2026-04): Chrome 105+, Safari 17.2+, Firefox 140+, iOS
// Safari 17.2+. When unsupported, isSupported() is false and callers must
// fall back to the legacy VocabWordLayer path.

import { ALL_HIGHLIGHT_NAMES } from './vocabHighlightEngine'
import { count } from './vocabHighlightTelemetry'

interface HighlightLike {
  clear: () => void
  size: number
  add: (range: Range) => void
}

interface HighlightRegistryLike {
  set: (name: string, highlight: HighlightLike) => void
  get: (name: string) => HighlightLike | undefined
  delete: (name: string) => boolean
  has: (name: string) => boolean
}

interface CSSWithHighlights {
  highlights?: HighlightRegistryLike
}

interface HighlightCtor {
  new (...ranges: Range[]): HighlightLike
}

function getCss(): CSSWithHighlights | null {
  if (typeof globalThis === 'undefined') return null
  const css = (globalThis as unknown as { CSS?: CSSWithHighlights }).CSS
  return css ?? null
}

function getHighlightCtor(): HighlightCtor | null {
  if (typeof globalThis === 'undefined') return null
  const ctor = (globalThis as unknown as { Highlight?: HighlightCtor }).Highlight
  return typeof ctor === 'function' ? ctor : null
}

let supportedCache: boolean | null = null

export function isSupported(): boolean {
  if (supportedCache !== null) return supportedCache
  const css = getCss()
  const ctor = getHighlightCtor()
  if (!css || !css.highlights || !ctor) {
    supportedCache = false
    return false
  }
  try {
    const probe = new ctor()
    if (!probe || typeof probe.add !== 'function' || typeof probe.clear !== 'function') {
      supportedCache = false
      return false
    }
  } catch {
    supportedCache = false
    return false
  }
  supportedCache = true
  return true
}

// Exposed for tests only — clears memoized support flag after mocks swap.
export function __resetSupportCache(): void {
  supportedCache = null
}

export interface RegisterResult {
  ok: boolean
  registered: number
}

// Register ranges under a single named highlight. Empty ranges → clear that
// name (we never want stale matches lingering after vocabMap shrinks).
export function registerRanges(name: string, ranges: readonly Range[]): RegisterResult {
  if (!isSupported()) return { ok: false, registered: 0 }
  const css = getCss()
  const Ctor = getHighlightCtor()
  if (!css?.highlights || !Ctor) return { ok: false, registered: 0 }

  if (ranges.length === 0) {
    return clear(name).ok
      ? { ok: true, registered: 0 }
      : { ok: false, registered: 0 }
  }

  try {
    const highlight = new Ctor()
    for (const r of ranges) highlight.add(r)
    css.highlights.set(name, highlight)
    const after = css.highlights.get(name)
    const registered = after?.size ?? 0
    if (registered !== ranges.length) {
      count('register.mismatch', { name, expected: ranges.length, actual: registered })
    } else {
      count('register.success', { name, size: registered })
    }
    return { ok: true, registered }
  } catch (err) {
    count('register.error', { name, error: String(err) })
    return { ok: false, registered: 0 }
  }
}

export function clear(name: string): RegisterResult {
  if (!isSupported()) return { ok: false, registered: 0 }
  const css = getCss()
  if (!css?.highlights) return { ok: false, registered: 0 }
  try {
    const existed = css.highlights.has(name)
    if (existed) {
      const h = css.highlights.get(name)
      h?.clear()
      css.highlights.delete(name)
    }
    count('clear.success', { name, existed })
    return { ok: true, registered: 0 }
  } catch (err) {
    count('clear.error', { name, error: String(err) })
    return { ok: false, registered: 0 }
  }
}

// Clear every highlight name the engine can produce. Safe to call on unmount
// or when layer disables itself via killswitch.
export function clearAll(): void {
  if (!isSupported()) return
  for (const name of ALL_HIGHLIGHT_NAMES) clear(name)
}

// Bulk register: groups from engine.groupByHighlight(). Clears any managed
// name not present in groups so stale ranges go away when vocabMap shrinks.
export function syncHighlights(groups: ReadonlyMap<string, readonly Range[]>): boolean {
  if (!isSupported()) return false
  let allOk = true
  for (const name of ALL_HIGHLIGHT_NAMES) {
    const ranges = groups.get(name) ?? []
    const res = registerRanges(name, ranges)
    if (!res.ok) allOk = false
  }
  return allOk
}
