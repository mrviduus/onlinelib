import * as Sentry from '@sentry/react-native'

/**
 * A trace that survives a release build.
 *
 * The language-onboarding defect was reproduced three times and produced no
 * evidence any of those times, because the instrumentation written to settle it
 * was `if (__DEV__) console.log(...)` — and every reproduction ran a release
 * build from Play plus an OTA, where `__DEV__` is false. Three runs of a
 * question that could not answer itself.
 *
 * This is the version that answers. Sentry breadcrumbs ride along with whatever
 * the session eventually reports, cost nothing when no DSN is configured
 * (`initSentry` is a no-op then, and `addBreadcrumb` on an uninitialised client
 * discards), and are visible from a tester's device without a cable.
 *
 * Use it for decisions whose inputs are invisible after the fact — not for
 * tracing ordinary flow, which is what makes a breadcrumb trail useless.
 */
export function breadcrumb(message: string, data?: Record<string, unknown>): void {
  try {
    Sentry.addBreadcrumb({ category: 'app', level: 'info', message, data })
  } catch {
    // Never let observability break the screen it observes.
  }
}
