import { publicFetch, jsonBody } from './client'

export interface TranslationResult {
  translatedText: string
}

export function translate(text: string, source: string, target: string) {
  return publicFetch<TranslationResult>('/translate', jsonBody('POST', { q: text, source, target }))
}
