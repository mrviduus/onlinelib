import { upsertProgress } from '../api/auth'
import { ApiError } from '../api/client'

const STORAGE_KEY_PREFIX = 'reading.progress.'

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface StoredProgress {
  chapterId?: string
  chapterSlug?: string
  locator?: string
  percent?: number
  updatedAt?: number
}

/**
 * Flush any anonymous reading-progress entries that `useReadingProgress` left in
 * localStorage while the user had no session. Called after a successful login/register
 * (or after bootstrap restores a real session) so switching devices / signing in later
 * does not drop progress the user accumulated while anonymous.
 *
 * Server-side LWW (updatedAt) makes order-independent writes safe; we still send
 * sequentially to avoid blowing the per-IP rate limit on first login.
 *
 * 4xx responses (edition gone, bad chapter) mean the entry is permanently broken —
 * remove it so we don't loop on the same dead keys every session. Network/5xx errors
 * keep the entry for the next retry.
 *
 * Returns the number of entries successfully flushed.
 */
export async function flushLocalProgress(): Promise<number> {
  let keys: string[]
  try {
    keys = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(STORAGE_KEY_PREFIX)) keys.push(k)
    }
  } catch {
    return 0
  }
  if (keys.length === 0) return 0

  let flushed = 0
  for (const key of keys) {
    const editionId = key.slice(STORAGE_KEY_PREFIX.length)

    if (!editionId || !GUID_RE.test(editionId)) {
      try { localStorage.removeItem(key) } catch {}
      continue
    }

    let parsed: StoredProgress
    try {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      parsed = JSON.parse(raw) as StoredProgress
    } catch {
      try { localStorage.removeItem(key) } catch {}
      continue
    }

    if (!parsed?.chapterId || !parsed.locator || !GUID_RE.test(parsed.chapterId)) {
      if (parsed?.chapterId && !GUID_RE.test(parsed.chapterId)) {
        try { localStorage.removeItem(key) } catch {}
      }
      continue
    }

    try {
      await upsertProgress(editionId, {
        chapterId: parsed.chapterId,
        locator: parsed.locator,
        percent: parsed.percent ?? null,
        updatedAt: new Date(parsed.updatedAt || Date.now()).toISOString(),
      })
      try { localStorage.removeItem(key) } catch {}
      flushed++
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        // 400 (bad body) / 404 (edition or chapter gone) — entry can't recover,
        // drop it so we stop retrying on every login.
        try { localStorage.removeItem(key) } catch {}
      }
      // 5xx / network — leave key so we retry next session.
    }
  }

  return flushed
}
