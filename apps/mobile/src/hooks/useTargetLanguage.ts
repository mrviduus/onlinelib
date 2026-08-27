import { useLanguage } from '../context/LanguageContext'
import { useNativeLanguage } from '../context/NativeLanguageContext'

/**
 * The language pair behind every word the reader taps.
 *
 * Two questions used to share one answer, and the conflation was the bug. They
 * are not the same question:
 *
 *   fromLang          — the language of the text in front of the reader.
 *   readerLang        — the language to ADDRESS the reader in. Always a real
 *                       language: an explanation of an English word for an
 *                       English speaker is written in English, and that is
 *                       useful.
 *   translationTarget — the language to translate INTO, or `null` when there is
 *                       nothing to translate into because the reader already
 *                       knows the language they are reading.
 *
 * The old shape returned a single `toLang` that fell back to `'en'` when native
 * matched the source. Its docblock claimed this was "a sensible fallback so we
 * never translate en → en" — the fallback WAS 'en', so an English reader of an
 * English book got exactly the en → en no-op the comment promised to prevent.
 * QA found it as a Translation panel with two identical sections both labelled
 * ENGLISH. `null` cannot be quietly passed to a translate call the way `'en'`
 * could; that is the point of the change.
 *
 * Mirrors web's `resolveTargetLang` (apps/web ReaderHighlights.tsx).
 */
export function useTargetLanguage(overrideFromLang?: string): {
  fromLang: string
  readerLang: string
  translationTarget: string | null
} {
  const { language } = useLanguage()
  const { nativeLanguage } = useNativeLanguage()

  const fromLang = overrideFromLang || language

  return {
    fromLang,
    readerLang: nativeLanguage,
    translationTarget: nativeLanguage !== fromLang ? nativeLanguage : null,
  }
}
