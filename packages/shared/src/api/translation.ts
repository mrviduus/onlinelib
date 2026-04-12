import { publicFetch, jsonBody } from './client'

export interface TranslationResult {
  translatedText: string
}

export function translate(text: string, source: string, target: string, signal?: AbortSignal) {
  const opts = jsonBody('POST', { text, sourceLang: source, targetLang: target })
  if (signal) opts.signal = signal
  return publicFetch<TranslationResult>('/translate', opts)
}
