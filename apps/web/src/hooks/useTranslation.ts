import { useCallback } from 'react'
import { useLanguage, SupportedLanguage } from '../context/LanguageContext'
import en from '../locales/en.json'

type TranslationData = typeof en

const translations: Record<SupportedLanguage, TranslationData> = { en }

function getNestedValue(obj: unknown, path: string): unknown {
  const keys = path.split('.')
  let value: unknown = obj
  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = (value as Record<string, unknown>)[key]
    } else {
      return undefined
    }
  }
  return value
}

export function useTranslation() {
  const { language } = useLanguage()

  // useCallback bound to [language] so t/tArray identities are stable across
  // renders and only change when the language actually changes. Without this,
  // every render returns new fn identities and any consumer using them in
  // useEffect/useCallback deps re-fires on every parent re-render.
  const t = useCallback((key: string, vars?: Record<string, string | number>): string => {
    const value = getNestedValue(translations[language], key)
    const str = typeof value === 'string'
      ? value
      : (typeof getNestedValue(translations.en, key) === 'string'
          ? getNestedValue(translations.en, key) as string
          : key)
    if (!vars) return str
    return str.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? String(vars[k]) : `{{${k}}}`))
  }, [language])

  const tArray = useCallback((key: string): string[] => {
    const value = getNestedValue(translations[language], key)
    if (Array.isArray(value)) return value as string[]
    const fallback = getNestedValue(translations.en, key)
    if (Array.isArray(fallback)) return fallback as string[]
    return []
  }, [language])

  return { t, tArray, language }
}
