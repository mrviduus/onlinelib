/**
 * One question: should this reader be asked what language they know?
 *
 * TextStack's thesis is that you learn a language by reading real books in it.
 * The native language is the one input that thesis cannot run without — it is
 * the target of every translation, every gloss, every vocabulary card. The app
 * shipped without ever asking for it, defaulted to English, and so translated
 * English into English for every new account. A manual QA pass put it plainly:
 * "between a broken and an excellent product is one setting nobody asked about".
 *
 * The decision lives here rather than in the screen because it is the part that
 * regresses: five inputs, four of which are asynchronous, and a wrong answer is
 * either a prompt that nags returning users forever or one that never appears.
 * `apps/mobile/vitest.config.ts` covers `src/lib/**` only, so a pure function is
 * also the only shape of this logic that can have tests at all.
 */
export interface LanguageOnboardingState {
  /** Signed in at all. Guests are never asked — they have nowhere to save it. */
  isAuthenticated: boolean
  isGuest: boolean
  /** `user.nativeLanguage` from the server. Null/empty means it never answered. */
  serverNativeLanguage: string | null | undefined
  /**
   * From `NativeLanguageContext`. **Null means "still reading AsyncStorage"** —
   * not "no". Treating null as false is the flash bug: every launch would show
   * the prompt for a frame before storage answers.
   */
  hasConfirmedLanguage: boolean | null
  /** Already looking at the prompt. Guards against a re-entrant redirect. */
  alreadyOnboarding?: boolean
}

export function shouldAskForLanguage(s: LanguageOnboardingState): boolean {
  if (!s.isAuthenticated || s.isGuest) return false
  if (s.alreadyOnboarding) return false
  // Undecided, not undecided-in-the-negative. Wait for storage.
  if (s.hasConfirmedLanguage === null) return false
  if (s.hasConfirmedLanguage) return false
  // A value on the server is an answer given on some device at some point.
  // Whitespace is not an answer — the profile endpoint accepts '' as "clear".
  if (s.serverNativeLanguage && s.serverNativeLanguage.trim() !== '') return false
  return true
}
