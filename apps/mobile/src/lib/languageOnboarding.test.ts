import { describe, it, expect } from 'vitest'
import { confirmationFor, languageOnboardingDecision, type LanguageOnboardingState } from './languageOnboarding'

// A reader storage HAS answered about — nobody on this device confirmed — and
// the server holds nothing. `isAuthenticated`/`isGuest` are gone from the state:
// the answer no longer depends on what kind of session is holding the phone.
const base: LanguageOnboardingState = {
  serverNativeLanguage: null,
  hasConfirmedLanguage: false,
}

describe('languageOnboardingDecision', () => {
  it('asks a signed-in user the server has no answer for', () => {
    // The QA account exactly: registered, `nativeLanguage: null`, never asked.
    expect(languageOnboardingDecision(base)).toBe('ask')
  })

  it('asks a guest', () => {
    // INVERTED on 2026-09-05, with the session model it was written against.
    //
    // The old assertion was 'skip' and the old reason was "a guest has no
    // profile row to save the answer into". There was no guest row then. There
    // is now: a guest IS a `User`, `PUT /me/profile` takes their token, and
    // registration promotes the same row in place — `AuthService` sets Email,
    // Name, PasswordHash and IsGuest and never touches NativeLanguage, so the
    // answer survives into the account.
    //
    // Left alone, this line would have been the whole defect. Mobile mints a
    // guest session at launch, so 'skip' for guests means every new install
    // reaches the reader with the device default and translates English into
    // English — at 100% of installs rather than the 0% it covered before.
    //
    // Nothing in the state distinguishes a guest any more; this is the shape
    // their session produces, and the case is kept because it is the one that
    // regressed.
    expect(languageOnboardingDecision({
      serverNativeLanguage: null, hasConfirmedLanguage: false,
    })).toBe('ask')
  })

  it('asks a first-launch reader with no session at all', () => {
    // Cold start before any session exists. `confirmationFor` resolves against
    // the 'local' owner, storage holds nobody, so the reader is asked and the
    // answer is stored under 'local' until an account adopts it.
    //
    // This replaces 'does not ask a signed-out visitor', which asserted 'skip'
    // for the same inputs. Both cannot hold. The old one was right while the
    // only place to ask was a full-screen route reached from inside the tabs —
    // a question with nowhere to put the answer. The question is now asked in
    // the translation sheet, where the answer is spent immediately, and the
    // decision to *interrupt* someone with a route moved to the call site
    // (`app/(tabs)/_layout.tsx` gates the redirect on `capabilitiesFor().isAccount`).
    expect(languageOnboardingDecision({
      serverNativeLanguage: undefined, hasConfirmedLanguage: false,
    })).toBe('ask')
  })

  it("answers 'unknown' — not 'skip' — while AsyncStorage has not answered", () => {
    // INVERTED on 2026-08-27, deliberately.
    //
    // This test used to assert `false`, and the function used to return it. The
    // reasoning was sound as far as it went: reading the null as "ask" would
    // flash the prompt at everyone for a frame on every cold start. But `false`
    // is also what "this reader has already answered" looks like, and the call
    // site cannot tell them apart — nothing in a boolean can.
    //
    // A retest found the consequence: the language screen appeared only from the
    // SECOND app launch. It existed, it worked, and it was never reached on the
    // landing it was built for, so every new account spent its first session
    // translating English into English — the exact defect the screen was written
    // to end.
    //
    // 'unknown' obliges the caller to decide what waiting looks like instead of
    // silently choosing "no" on its behalf.
    expect(languageOnboardingDecision({ ...base, hasConfirmedLanguage: null })).toBe('unknown')
  })

  it('does not ask again once the choice was made locally', () => {
    expect(languageOnboardingDecision({ ...base, hasConfirmedLanguage: true })).toBe('skip')
  })

  it('does not ask when the server already holds an answer', () => {
    // Chosen on the web, or on another device. Asking again would be a regression
    // for every existing user.
    expect(languageOnboardingDecision({ ...base, serverNativeLanguage: 'uk' })).toBe('skip')
  })

  it('treats an empty or blank server value as no answer', () => {
    // `authApi.updateProfile` documents '' as "clear this field", so an empty
    // string reaches us as a real value and must not count as a choice.
    expect(languageOnboardingDecision({ ...base, serverNativeLanguage: '' })).toBe('ask')
    expect(languageOnboardingDecision({ ...base, serverNativeLanguage: '   ' })).toBe('ask')
  })

  it('does not redirect when the prompt is already on screen', () => {
    // Without this the onboarding route re-triggers its own guard and loops.
    expect(languageOnboardingDecision({ ...base, alreadyOnboarding: true })).toBe('skip')
  })

  it('does not re-ask an account that answered as a guest', () => {
    // The adoption path, end to end. A guest answers: the value goes to their
    // profile (`NativeLanguageContext.setNativeLanguage`, guests included since
    // this slice) and the owner is stamped locally. They register; the row is
    // promoted in place, so the id and the language both survive. Whichever of
    // the two signals arrives first at this function, the answer is 'skip'.
    //
    // Storage stamp survived (same user id after promotion):
    expect(languageOnboardingDecision({
      ...base, hasConfirmedLanguage: true, serverNativeLanguage: null,
    })).toBe('skip')
    // Or a fresh install signs into that account: the stamp is gone, the server
    // still holds what the guest said.
    expect(languageOnboardingDecision({
      ...base, hasConfirmedLanguage: false, serverNativeLanguage: 'uk',
    })).toBe('skip')
  })

  it('server answer wins over a missing local confirmation', () => {
    // Reinstall: AsyncStorage is empty, the account is years old. Restoring the
    // language from the server must not come with an interrogation.
    expect(languageOnboardingDecision({
      ...base, serverNativeLanguage: 'de', hasConfirmedLanguage: false,
    })).toBe('skip')
  })
})

describe('confirmationFor', () => {
  it('is null while storage has not answered', () => {
    // Not false. A caller that treats "not yet known" as "no" asks a reader who
    // already answered — or, in the shape that actually shipped, skips asking a
    // reader who has not.
    expect(confirmationFor(undefined, 'user-1')).toBeNull()
  })

  it('is false when nobody on this device has answered', () => {
    expect(confirmationFor(null, 'user-1')).toBe(false)
  })

  it('is true only for the account that answered', () => {
    expect(confirmationFor('user-1', 'user-1')).toBe(true)
    // The bug this replaced: a device-wide '1' meant the second account on a
    // shared phone was never asked.
    expect(confirmationFor('user-1', 'user-2')).toBe(false)
  })

  it('lets a guest answer carry into the account they register', () => {
    // The answer was given with no session at all, so it is owned by 'local';
    // once a session exists ownerId is a user id, this reads false, and the
    // context adopts the value by re-stamping the owner. Adoption is the
    // context's job — this function must not pretend the answer was theirs.
    expect(confirmationFor('local', 'user-1')).toBe(false)
    expect(confirmationFor('local', 'local')).toBe(true)
    // Note what does NOT need adopting: a guest who answers while holding a
    // session is stamped with their user id, and registration promotes that
    // same row, so the id does not change and this still reads true.
    expect(confirmationFor('user-1', 'user-1')).toBe(true)
  })
})
