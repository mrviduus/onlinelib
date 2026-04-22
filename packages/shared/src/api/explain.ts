import { publicFetch, jsonBody } from './client'

export interface ExplainRequest {
  word: string
  sentence: string
  genre?: string | null
  bookId?: string | null
  targetLang?: string | null
}

export interface ExplainResponse {
  explanation: string
  cached: boolean
}

export function explain(req: ExplainRequest, signal?: AbortSignal) {
  const opts = jsonBody('POST', req)
  if (signal) opts.signal = signal
  return publicFetch<ExplainResponse>('/explain', opts)
}
