// Single source of truth for UI feature flags. Values read from Vite env at build time.
// Defaults are OFF — core product ships clean; opt-in per deploy via VITE_FEATURE_* env vars.

export const FEATURES = {} as const

export type FeatureKey = keyof typeof FEATURES
