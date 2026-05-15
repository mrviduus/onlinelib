import { useLanguage } from '../context/LanguageContext'
import { useNativeLanguage } from '../context/NativeLanguageContext'

/**
 * Resolves the canonical "book language → user native language" pair for
 * translation and dictionary lookups.
 *
 *   fromLang  — the language of the text being consumed (current book / UI
 *               reading language).
 *   toLang    — the language to translate into; user's native when it
 *               differs from the source, otherwise a sensible fallback so
 *               we never translate en → en (which would be a no-op).
 *
 * Centralising this prevents per-component drift — before this hook,
 * TranslationSheet / WordCard each derived the pair differently and some
 * hardcoded `en → uk`. (DictionarySheet was a third caller; removed 2026-05-15
 * when mobile dropped the Free Dictionary API.)
 */
export function useTargetLanguage(overrideFromLang?: string): {
  fromLang: string
  toLang: string
} {
  const { language } = useLanguage()
  const { nativeLanguage } = useNativeLanguage()

  const fromLang = overrideFromLang || language
  const toLang =
    nativeLanguage !== fromLang
      ? nativeLanguage
      : 'en'

  return { fromLang, toLang }
}
