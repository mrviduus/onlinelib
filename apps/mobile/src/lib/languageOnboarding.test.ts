import { describe, it, expect } from 'vitest'
import { shouldAskForLanguage, type LanguageOnboardingState } from './languageOnboarding'

const base: LanguageOnboardingState = {
  isAuthenticated: true,
  isGuest: false,
  serverNativeLanguage: null,
  hasConfirmedLanguage: false,
}

describe('shouldAskForLanguage', () => {
  it('asks a signed-in user the server has no answer for', () => {
    // The QA account exactly: registered, `nativeLanguage: null`, never asked.
    expect(shouldAskForLanguage(base)).toBe(true)
  })

  it('does not ask a guest', () => {
    // A guest has no profile row to save the answer into, and gets the prompt
    // after registering instead.
    expect(shouldAskForLanguage({ ...base, isGuest: true })).toBe(false)
  })

  it('does not ask a signed-out visitor', () => {
    expect(shouldAskForLanguage({ ...base, isAuthenticated: false })).toBe(false)
  })

  it('does not ask while AsyncStorage has not answered yet', () => {
    // This is the whole reason `hasConfirmedLanguage` is a tri-state. Reading it
    // as a boolean shows the prompt for a frame on every cold start, to everyone.
    expect(shouldAskForLanguage({ ...base, hasConfirmedLanguage: null })).toBe(false)
  })

  it('does not ask again once the choice was made locally', () => {
    expect(shouldAskForLanguage({ ...base, hasConfirmedLanguage: true })).toBe(false)
  })

  it('does not ask when the server already holds an answer', () => {
    // Chosen on the web, or on another device. Asking again would be a regression
    // for every existing user.
    expect(shouldAskForLanguage({ ...base, serverNativeLanguage: 'uk' })).toBe(false)
  })

  it('treats an empty or blank server value as no answer', () => {
    // `authApi.updateProfile` documents '' as "clear this field", so an empty
    // string reaches us as a real value and must not count as a choice.
    expect(shouldAskForLanguage({ ...base, serverNativeLanguage: '' })).toBe(true)
    expect(shouldAskForLanguage({ ...base, serverNativeLanguage: '   ' })).toBe(true)
  })

  it('does not redirect when the prompt is already on screen', () => {
    // Without this the onboarding route re-triggers its own guard and loops.
    expect(shouldAskForLanguage({ ...base, alreadyOnboarding: true })).toBe(false)
  })

  it('server answer wins over a missing local confirmation', () => {
    // Reinstall: AsyncStorage is empty, the account is years old. Restoring the
    // language from the server must not come with an interrogation.
    expect(shouldAskForLanguage({
      ...base, serverNativeLanguage: 'de', hasConfirmedLanguage: false,
    })).toBe(false)
  })
})
