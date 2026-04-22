// Mobile UI feature flags. Expo exposes env vars prefixed with EXPO_PUBLIC_* at build time.
// Defaults OFF — enable per-deploy via `EXPO_PUBLIC_FEATURE_*` in EAS secrets or `.env.local`.

const parseFlag = (val: string | undefined, defaultValue: boolean): boolean => {
  if (val === 'true' || val === '1') return true
  if (val === 'false' || val === '0') return false
  return defaultValue
}

export const FEATURES = {
  AMBIENT_SOCIAL: parseFlag(process.env.EXPO_PUBLIC_FEATURE_AMBIENT_SOCIAL, false),
} as const

export type FeatureKey = keyof typeof FEATURES
