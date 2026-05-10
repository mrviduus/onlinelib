// API_BASE is the host (dev: http://localhost:8080) or `/api` (prod, nginx
// strips the prefix and proxies the rest to backend). Backend route is
// `/explain` (no prefix). Don't add `/api/` here or prod gets `/api/api/...`.
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
  const res = await fetch(`${API_BASE}/explain`, {
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
