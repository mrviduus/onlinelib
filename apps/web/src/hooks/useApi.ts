import { useMemo } from 'react'
import { useLanguage } from '../context/LanguageContext'
import { createApi } from '../api/client'

export function useApi() {
  const { language } = useLanguage()
  return useMemo(() => createApi(language), [language])
}
