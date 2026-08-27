import { describe, it, expect } from 'vitest'
import { languageOnboardingDecision, type LanguageOnboardingState } from './languageOnboarding'

const base: LanguageOnboardingState = {
  isAuthenticated: true,
  isGuest: false,
  serverNativeLanguage: null,
  hasConfirmedLanguage: false,
}

describe('languageOnboardingDecision', () => {
  it('asks a signed-in user the server has no answer for', () => {
    // The QA account exactly: registered, `nativeLanguage: null`, never asked.
    expect(languageOnboardingDecision(base)).toBe('ask')
  })

  it('does not ask a guest', () => {
    // A guest has no profile row to save the answer into, and gets the prompt
    // after registering instead.
    expect(languageOnboardingDecision({ ...base, isGuest: true })).toBe('skip')
  })

  it('does not ask a signed-out visitor', () => {
    expect(languageOnboardingDecision({ ...base, isAuthenticated: false })).toBe('skip')
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

  it('server answer wins over a missing local confirmation', () => {
    // Reinstall: AsyncStorage is empty, the account is years old. Restoring the
    // language from the server must not come with an interrogation.
    expect(languageOnboardingDecision({
      ...base, serverNativeLanguage: 'de', hasConfirmedLanguage: false,
    })).toBe('skip')
  })
})
