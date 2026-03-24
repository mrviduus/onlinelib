export interface ApiConfig {
  baseUrl: string
  getAccessToken: () => Promise<string | null>
  onUnauthorized: () => Promise<string | null> // should refresh and return new token, or null
}

let config: ApiConfig | null = null

export function initApi(c: ApiConfig) {
  config = c
}

export function getApiConfig(): ApiConfig {
  if (!config) throw new Error('API not initialized. Call initApi() first.')
  return config
}

export function getStorageUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined
  // baseUrl is like "https://textstack.app/api" — storage is at origin, not under /api
  const base = getApiConfig().baseUrl.replace(/\/api\/?$/, '')
  return `${base}/storage/${path}`
}

export async function authFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const { baseUrl, getAccessToken, onUnauthorized } = getApiConfig()

  const token = await getAccessToken()
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string>),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${baseUrl}${path}`, { ...options, headers })

  if (res.status === 401) {
    const newToken = await onUnauthorized()
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`
      const retry = await fetch(`${baseUrl}${path}`, { ...options, headers })
      if (!retry.ok) throw new ApiError(retry.status, 'Unauthorized')
      const text = await retry.text()
      return text ? JSON.parse(text) : ({} as T)
    }
    throw new ApiError(401, 'Unauthorized')
  }

  if (!res.ok) {
    const text = await res.text()
    let message = `API error: ${res.status}`
    try {
      const json = JSON.parse(text)
      if (json.error) message = json.error
    } catch {}
    throw new ApiError(res.status, message)
  }

  const text = await res.text()
  if (!text) return {} as T
  return JSON.parse(text)
}

export async function publicFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const { baseUrl } = getApiConfig()

  const res = await fetch(`${baseUrl}${path}`, options)

  if (!res.ok) {
    const text = await res.text()
    let message = `API error: ${res.status}`
    try {
      const json = JSON.parse(text)
      if (json.error) message = json.error
    } catch {}
    throw new ApiError(res.status, message)
  }

  const text = await res.text()
  if (!text) return {} as T
  return JSON.parse(text)
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}
