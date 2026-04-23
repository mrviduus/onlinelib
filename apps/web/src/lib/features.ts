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
