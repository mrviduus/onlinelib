const API_BASE = import.meta.env.VITE_API_URL ?? ''

export interface TranslateResponse {
  translatedText: string
  sourceLang: string
  targetLang: string
}

export interface LanguageInfo {
  code: string
  name: string
}

export interface TranslateContext {
  /** Book id (editionId for catalog books, userBookId for uploads). Backend
   *  uses it to look up the book's genre and bias the prompt toward the
   *  domain-specific meaning when the word is ambiguous. */
  bookId?: string | null
  /** The sentence the word was tapped in. Lets the model disambiguate
   *  ("warehouse" → storage facility vs data warehouse) without us having to
   *  enumerate domains client-side. */
  sentence?: string | null
}

export async function translate(
  text: string,
  sourceLang: string,
  targetLang: string,
  signal?: AbortSignal,
  ctx?: TranslateContext,
): Promise<TranslateResponse> {
  const res = await fetch(`${API_BASE}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      sourceLang,
      targetLang,
      // Optional fields — backend ignores when absent and falls back to
      // the legacy context-free prompt.
      bookId: ctx?.bookId ?? undefined,
      sentence: ctx?.sentence ?? undefined,
    }),
    signal,
  })

  if (!res.ok) {
    if (res.status === 503) {
      throw new Error('Translation service unavailable')
    }
    if (res.status === 504) {
      throw new Error('Translation request timed out')
    }
    const text = await res.text()
    let error = `Translation failed: ${res.status}`
    try {
      const json = JSON.parse(text)
      if (json.detail) error = json.detail
    } catch {}
    throw new Error(error)
  }

  return res.json()
}

export async function getLanguages(): Promise<LanguageInfo[]> {
  const res = await fetch(`${API_BASE}/translate/languages`)

  if (!res.ok) {
    throw new Error('Failed to fetch languages')
  }

  return res.json()
}
