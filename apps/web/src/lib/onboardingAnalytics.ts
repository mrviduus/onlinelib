export type OnboardingEvent =
  | 'word_hint_shown'
  | 'word_hint_tapped'
  | 'word_hint_timeout'
  | 'micro_prompt_shown'
  | 'micro_prompt_accepted'
  | 'micro_prompt_dismissed'
  | 'micro_practice_answered'
  | 'micro_practice_correct'
  | 'micro_practice_incorrect'
  | 'registration_prompt_shown'
  | 'registration_prompt_accepted'
  | 'registration_prompt_dismissed'

export function trackOnboarding(event: OnboardingEvent, data?: Record<string, unknown>) {
  if (import.meta.env.DEV) {
    console.debug('[onboarding]', event, data)
  }
  window.dispatchEvent(
    new CustomEvent('onboarding', { detail: { event, ...data, ts: Date.now() } }),
  )
}
