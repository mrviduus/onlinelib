import { publicFetch } from './client'

export interface TranslationResult {
  translatedText: string
}

export function translate(text: string, source: string, target: string) {
  return publicFetch<TranslationResult>('/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, source, target }),
  })
}
