import { useAuth } from '../context/AuthContext'
import { useNativeLanguage } from '../context/NativeLanguageContext'
import { languageOnboardingDecision } from '../lib/languageOnboarding'

/**
 * Has this reader ever told us what language they know?
 *
 * The same question `app/(tabs)/_layout.tsx` asks, wired to the same pure
 * function, so the two surfaces cannot drift into disagreeing about whether a
 * reader has answered. Two places need it because there are two ways to ask:
 * the full-screen route (accounts only — it is an interruption) and, for
 * everyone else, in place at the first long-press.
 *
 * `false` while AsyncStorage is still answering ('unknown'), which is the right
 * default for UI: waiting shows nothing rather than flashing a question at a
 * reader who answered months ago.
 */
export function useNeedsNativeLanguage(): boolean {
  const { user } = useAuth()
  const { hasConfirmedLanguage } = useNativeLanguage()
  return languageOnboardingDecision({
    serverNativeLanguage: user?.nativeLanguage,
    hasConfirmedLanguage,
  }) === 'ask'
}
