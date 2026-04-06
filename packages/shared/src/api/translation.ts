import { publicFetch, jsonBody } from './client'

export interface TranslationResult {
  translatedText: string
}

export function translate(text: string, source: string, target: string) {
  return publicFetch<TranslationResult>('/translate', jsonBody('POST', { text, sourceLang: source, targetLang: target }))
}
