const API_BASE = import.meta.env.VITE_API_URL ?? ''

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

export async function explain(req: ExplainRequest, signal?: AbortSignal): Promise<ExplainResponse> {
  const res = await fetch(`${API_BASE}/api/explain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  })

  if (!res.ok) {
    if (res.status === 503) throw new Error('Explain service unavailable')
    if (res.status === 504) throw new Error('Explain request timed out')
    if (res.status === 429) throw new Error('Too many requests, try again later')
    const text = await res.text()
    let error = `Explain failed: ${res.status}`
    try {
      const json = JSON.parse(text)
      if (json.detail) error = json.detail
    } catch {}
    throw new Error(error)
  }

  return res.json()
}
