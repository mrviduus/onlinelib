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
 * regresses: three inputs, two of which are asynchronous, and a wrong answer is
 * either a prompt that nags returning users forever or one that never appears.
 * `apps/mobile/vitest.config.ts` covers `src/lib/**` only, so a pure function is
 * also the only shape of this logic that can have tests at all.
 */
export interface LanguageOnboardingState {
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

/**
 * Three answers, because there are three.
 *
 * This used to return a boolean, and `null` — "AsyncStorage has not answered
 * yet" — came back as `false`. The docblock called that waiting; the call site
 * could not tell it from "no", because nothing in a boolean can. A retest found
 * the language question appearing only from the SECOND app launch: the screen
 * existed, worked, and was never reached on the landing it was built for, so
 * every new account still spent its first session translating English into
 * English.
 *
 * `'unknown'` obliges the caller to decide what waiting looks like. The app
 * already has the pattern — `app/(tabs)/index.tsx` renders a blank themed view
 * while the stored session is still loading rather than redirecting on a guess.
 */
export type LanguageOnboardingDecision = 'ask' | 'skip' | 'unknown'

export function languageOnboardingDecision(s: LanguageOnboardingState): LanguageOnboardingDecision {
  // No `isAuthenticated`/`isGuest` predicate any more, deliberately.
  //
  // It read `if (!isAuthenticated || isGuest) return 'skip'`, and its docblock
  // justified it: a guest "has nowhere to save it". That was true of a session
  // that did not exist. A guest is a real `User` row, `PUT /me/profile` accepts
  // their token, and the in-place promotion at registration keeps the column —
  // so there is somewhere to save it, and there always was for anyone holding
  // a token. For an answer given before any session there is `LOCAL_OWNER`,
  // which the account adopts on sign-in (`NativeLanguageContext`).
  //
  // Keeping it while mobile mints guest sessions would have inverted the
  // module's own purpose: every new install starts as a guest, so *nobody* is
  // asked, and every new reader translates English into English — the defect
  // this file exists to end, at 100% of installs instead of 0%.
  //
  // What is left is the whole question: has THIS owner answered, and does the
  // server hold an answer. Whether an *interruption* is an appropriate way to
  // ask is a call-site decision — `app/(tabs)/_layout.tsx` still keeps the
  // full-screen route for full accounts only.
  if (s.alreadyOnboarding) return 'skip'
  // Not "no". The caller must wait rather than proceed.
  if (s.hasConfirmedLanguage === null) return 'unknown'
  if (s.hasConfirmedLanguage) return 'skip'
  // A value on the server is an answer given on some device at some point.
  // Whitespace is not an answer — the profile endpoint accepts '' as "clear".
  if (s.serverNativeLanguage && s.serverNativeLanguage.trim() !== '') return 'skip'
  return 'ask'
}


/**
 * Whether THIS account has answered the language question, given what storage
 * says and who is asking.
 *
 * The stored value is an owner — a user id, or `LOCAL_OWNER` for an answer given
 * before signing in — and not a bare flag. It was `'1'` once, meaning "somebody
 * on this device answered", which is why a device where account A had answered
 * never asked account B. Keeping the rule here rather than inline in the context
 * is what makes it testable at all: mobile's vitest scope is `src/lib/` only.
 *
 * `undefined` means storage has not answered yet and is deliberately distinct
 * from "no": collapsing them is how the question arrived one launch late.
 */
export function confirmationFor(
  confirmedOwner: string | null | undefined,
  ownerId: string,
): boolean | null {
  if (confirmedOwner === undefined) return null
  return confirmedOwner === ownerId
}
