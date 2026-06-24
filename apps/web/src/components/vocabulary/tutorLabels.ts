// Display helpers that tolerate untrusted LLM strings. `exerciseType` and `difficulty` come straight from
// the model — guard them so an unexpected value doesn't render a raw i18n key (`tutor.exercise.foo`) or
// blow up the layout.

const KNOWN_EXERCISE_TYPES = new Set(['recognition', 'recall', 'context'])

/**
 * Label for an exercise type. For a known type we use the i18n key; for anything unexpected from the model
 * we fall back to the raw value (or a generic label) rather than leaking `tutor.exercise.<garbage>`.
 */
export function exerciseLabel(exerciseType: string, t: (key: string) => string): string {
  if (KNOWN_EXERCISE_TYPES.has(exerciseType)) return t(`tutor.exercise.${exerciseType}`)
  const raw = exerciseType?.trim()
  return raw ? raw : t('tutor.exercise.generic')
}

/** Known types map to a styled badge variant; unknown types get a neutral default. */
export function exerciseBadgeClass(exerciseType: string): string {
  const variant = KNOWN_EXERCISE_TYPES.has(exerciseType) ? exerciseType : 'default'
  return `tutor-badge tutor-badge--${variant}`
}
