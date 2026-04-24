// Single source of truth for UI feature flags. Values read from Vite env at build time.
// Defaults are OFF — core product ships clean; opt-in per deploy via VITE_FEATURE_* env vars.

function readBool(v: unknown, fallback = false): boolean {
  if (typeof v !== 'string') return fallback
  const s = v.trim().toLowerCase()
  if (s === '1' || s === 'true' || s === 'yes' || s === 'on') return true
  if (s === '0' || s === 'false' || s === 'no' || s === 'off') return false
  return fallback
}

export const FEATURES = {
  // New vocab-highlight path (CSS Custom Highlight API + React overlay).
  // Default on — fallback path is still legacy VocabWordLayer when the API
  // is unsupported or the runtime killswitch trips.
  customVocabHighlights: readBool(import.meta.env.VITE_READER_CUSTOM_HIGHLIGHTS, true),
  // Oracle shadow-mode: run engine in parallel to legacy and log any diff.
  // Default OFF — enabled in staging before prod rollout.
  vocabHighlightsOracle: readBool(import.meta.env.VITE_READER_HIGHLIGHTS_ORACLE, false),
  // New unified SVG-overlayer reader (foliate-js port). Default OFF until
  // slice 8 prod rollout. Fallback = legacy ReaderContent + per-layer DOM.
  readerOverlayV2: readBool(import.meta.env.VITE_READER_OVERLAY_V2, false),
} as const

export type FeatureKey = keyof typeof FEATURES

// Runtime killswitch — readable from DevTools by support staff.
// `window.__textstackDisableCustomHighlights = true` force-falls-back to legacy.
export function isRuntimeKillswitchSet(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean(
    (window as unknown as { __textstackDisableCustomHighlights?: boolean })
      .__textstackDisableCustomHighlights,
  )
}

// Killswitch for the reader overlay v2 path. Set
// `window.__textstackForceLegacyReader = true` to force the legacy path.
export function isReaderOverlayKillswitchSet(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean(
    (window as unknown as { __textstackForceLegacyReader?: boolean })
      .__textstackForceLegacyReader,
  )
}

// Runtime enabler for staged rollout. Owner / support can flip overlay v2 on
// for a single browser without rebuilding the prod bundle:
//   localStorage.setItem('textstack.readerOverlayV2', '1')
//   // or in DevTools: window.__textstackForceOverlayReader = true
// Persistent so page reloads keep the override. Killswitch above still wins.
export function isReaderOverlayRuntimeEnabled(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as unknown as { __textstackForceOverlayReader?: boolean }
  if (w.__textstackForceOverlayReader) return true
  try {
    return window.localStorage?.getItem('textstack.readerOverlayV2') === '1'
  } catch {
    return false
  }
}

// Per-device killswitch via localStorage. Mirrors mobile cascade so support
// can hand a user a one-liner — no DevTools-only window flag required:
//   localStorage.setItem('textstack.readerOverlayV2', '0'); location.reload()
// Wins over the build-time default; window killswitch above still wins over this.
export function isReaderOverlayStorageKillswitchSet(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage?.getItem('textstack.readerOverlayV2') === '0'
  } catch {
    return false
  }
}

// Single resolver used by the reader. Build-time flag OR runtime opt-in, minus
// killswitch. Callers should depend on this, not the raw FEATURES key.
export function isReaderOverlayV2Active(): boolean {
  if (isReaderOverlayKillswitchSet()) return false
  if (isReaderOverlayStorageKillswitchSet()) return false
  return FEATURES.readerOverlayV2 || isReaderOverlayRuntimeEnabled()
}
