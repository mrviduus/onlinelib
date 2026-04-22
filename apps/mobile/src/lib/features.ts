// Mobile UI feature flags. Expo exposes env vars prefixed with EXPO_PUBLIC_* at build time.
// Defaults OFF — enable per-deploy via `EXPO_PUBLIC_FEATURE_*` in EAS secrets or `.env.local`.

export const FEATURES = {} as const

export type FeatureKey = keyof typeof FEATURES
