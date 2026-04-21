import en from './en.json'

interface TranslationNode { [key: string]: string | TranslationNode }
type Translations = TranslationNode

export const translations: Record<string, Translations> = { en }

export const supportedLanguages = ['en'] as const
export type Language = (typeof supportedLanguages)[number]

/** Get translation by dot-notation key: t('en', 'home.hero.title') */
export function t(lang: Language, key: string): string {
  const parts = key.split('.')
  let current: string | TranslationNode | undefined = translations[lang]
  for (const part of parts) {
    if (current == null || typeof current === 'string') return key
    current = current[part]
  }
  return typeof current === 'string' ? current : key
}
