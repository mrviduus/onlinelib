// Single source of truth for UI feature flags. Values read from Vite env at build time.
// Defaults are OFF — core product ships clean; opt-in per deploy via VITE_FEATURE_* env vars.
//
// To enable a flag locally: add `VITE_FEATURE_MOODS=true` to `apps/web/.env.local` and restart dev.

const parseFlag = (val: string | undefined, defaultValue: boolean): boolean => {
  if (val === 'true' || val === '1') return true
  if (val === 'false' || val === '0') return false
  return defaultValue
}

export const FEATURES = {
  MOODS: parseFlag(import.meta.env.VITE_FEATURE_MOODS, false),
  REVIEWS: parseFlag(import.meta.env.VITE_FEATURE_REVIEWS, false),
  AMBIENT_SOCIAL: parseFlag(import.meta.env.VITE_FEATURE_AMBIENT_SOCIAL, false),
} as const

export type FeatureKey = keyof typeof FEATURES
