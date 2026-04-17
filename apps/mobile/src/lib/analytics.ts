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
