// Admin-only feature flags. Hide internal dev tools from the production admin panel.
// Defaults OFF — dev machines opt-in via `apps/admin/.env.local`.

const parseFlag = (val: string | undefined, defaultValue: boolean): boolean => {
  if (val === 'true' || val === '1') return true
  if (val === 'false' || val === '0') return false
  return defaultValue
}

export const ADMIN_FEATURES = {
  BOARD_TASKS: parseFlag(import.meta.env.VITE_FEATURE_BOARD_TASKS, false),
} as const

export type AdminFeatureKey = keyof typeof ADMIN_FEATURES
