/**
 * Analytics: typed wrapper mirroring apps/web/src/lib/analytics.ts.
 *
 * - Transport: console.debug only for now (no Firebase/Expo Analytics wired).
 * - Event names + param shapes are 1:1 with web so a future transport swap
 *   is trivial and cross-platform dashboards can aggregate both surfaces.
 * - Never throws — analytics must never break the app.
 *
 * Web-only events (landing_cta_click, exit_intent_*) are intentionally
 * excluded.
 */

import { pathnamePrefix } from '@textstack/shared'

/** Allowed event names. Keep in sync with web + GA4 Key Events config. */
export type AnalyticsEvent =
  | 'sign_up'
  | 'login'
  | 'book_opened'
  | 'reading_session_end'
  | 'vocab_saved'
  | 'book_uploaded'
  | 'translation_used'
  | 'tts_played'
  | 'search_performed'
  /** AppState foreground/background transitions. Specifically wired so we
   *  can debug post-launch "app opens on random screens" reports — the
   *  event payload includes how long we were backgrounded and whether we
   *  decided to reset navigation. */
  | 'app_resumed_from_background'

type Params = Record<string, string | number | boolean | null | undefined>

const isDev = typeof __DEV__ !== 'undefined' && __DEV__ === true

/**
 * Emit an analytics event. Currently console-only; a real transport
 * (Firebase / Expo Analytics) can be plugged here without touching
 * call-sites. Never throws.
 */
export function track(event: AnalyticsEvent, params?: Params): void {
  try {
    if (isDev) {
      // eslint-disable-next-line no-console
      console.debug('[analytics]', event, params ?? {})
    }
    // TODO: wire real transport (Firebase Analytics / Expo Analytics) here.
  } catch {
    // Swallow — analytics must never break the app.
  }
}

export function trackSignUp(method: 'email' | 'google' | 'apple'): void {
  track('sign_up', { method })
}

export function trackLogin(method: 'email' | 'google' | 'apple'): void {
  track('login', { method })
}

export function trackBookOpened(args: {
  source: 'library' | 'userbook' | 'demo'
  editionId?: string | null
  userBookId?: string | null
  language?: string
}): void {
  track('book_opened', {
    source: args.source,
    edition_id: args.editionId ?? undefined,
    user_book_id: args.userBookId ?? undefined,
    language: args.language,
  })
}

export function trackReadingSessionEnd(args: {
  durationSeconds: number
  wordsRead: number
  startPercent: number
  endPercent: number
  editionId?: string | null
  userBookId?: string | null
}): void {
  track('reading_session_end', {
    duration_seconds: Math.round(args.durationSeconds),
    minutes: Math.round(args.durationSeconds / 60),
    words_read: args.wordsRead,
    start_percent: Math.round(args.startPercent * 100) / 100,
    end_percent: Math.round(args.endPercent * 100) / 100,
    edition_id: args.editionId ?? undefined,
    user_book_id: args.userBookId ?? undefined,
  })
}

export function trackVocabSaved(args: {
  language: string
  nativeLanguage?: string
  source: 'reader' | 'manual'
}): void {
  track('vocab_saved', {
    language: args.language,
    native_language: args.nativeLanguage,
    source: args.source,
  })
}

export function trackBookUploaded(args: {
  format: string
  sizeBytes: number
}): void {
  track('book_uploaded', {
    format: args.format,
    size_bytes: args.sizeBytes,
    size_mb: Math.round((args.sizeBytes / 1024 / 1024) * 10) / 10,
  })
}

export function trackTranslationUsed(args: {
  fromLang: string
  toLang: string
  kind: 'word' | 'selection'
}): void {
  track('translation_used', {
    from_lang: args.fromLang,
    to_lang: args.toLang,
    kind: args.kind,
  })
}

export function trackTtsPlayed(args: {
  language: string
  kind: 'word' | 'sentence' | 'selection'
}): void {
  track('tts_played', { language: args.language, kind: args.kind })
}

export function trackSearchPerformed(args: {
  query: string
  resultsCount?: number
}): void {
  track('search_performed', {
    query: args.query.slice(0, 100),
    results_count: args.resultsCount,
  })
}

/**
 * AppState foreground transition observability.
 *
 * Wired into ColdResetOnResume so we can answer post-launch questions
 * like:
 *   - How often do users come back after >30 min? (cold-reset rate)
 *   - Are protected-route skips actually firing? (`reset=false` + `was_in_reader=true`)
 *   - Are any users getting reset while in reader? (would indicate a
 *     pathname-detection bug we can't reproduce in dev)
 *
 * `bucket_minutes` is bucketed to avoid PII (exact session length leak)
 * and to keep cardinality low for analytics dashboards.
 */
export function trackAppResumedFromBackground(args: {
  backgroundedForMs: number
  pathname: string
  wasInProtectedRoute: boolean
  resetToHome: boolean
}): void {
  // Buckets: 0-1m, 1-5m, 5-30m, 30m-2h, 2h+. Matches the cold-reset
  // threshold (30m) so the boundary is observable in dashboards.
  const m = args.backgroundedForMs / 60_000
  const bucket =
    m < 1 ? '<1m'
    : m < 5 ? '1-5m'
    : m < 30 ? '5-30m'
    : m < 120 ? '30m-2h'
    : '2h+'
  track('app_resumed_from_background', {
    bucket_minutes: bucket,
    // Path prefix only (no slugs) — avoids leaking book identifiers.
    path_prefix: pathnamePrefix(args.pathname),
    was_in_protected_route: args.wasInProtectedRoute,
    reset_to_home: args.resetToHome,
  })
}

// pathnamePrefix lives in @textstack/shared (unit-tested) — used here for
// PII-safe path compression in analytics events.
