import { publicFetch, jsonBody } from './client'

export interface TranslationResult {
  translatedText: string
  /** Single-word save recommendation from the backend frequency filter:
   *  'common' (likely known) | 'learnable' (worth saving) | 'rare' | undefined
   *  (phrase / non-English / unknown). Informational only — never gates save. */
  category?: 'common' | 'learnable' | 'rare'
}

export function translate(text: string, source: string, target: string, signal?: AbortSignal) {
  const opts = jsonBody('POST', { text, sourceLang: source, targetLang: target })
  if (signal) opts.signal = signal
  return publicFetch<TranslationResult>('/translate', opts)
}
