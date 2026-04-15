import { upsertProgress } from '../api/auth'

const STORAGE_KEY_PREFIX = 'reading.progress.'

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
 * Server-side LWW (updatedAt) makes order-independent parallel writes safe.
 * Returns the number of entries successfully flushed (caller uses this to decide
 * whether to show the "progress kept" reassurance toast).
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

  const results = await Promise.allSettled(keys.map(async (key) => {
    const editionId = key.slice(STORAGE_KEY_PREFIX.length)
    if (!editionId) return { key, flushed: false } as const

    let parsed: StoredProgress
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return { key, flushed: false } as const
      parsed = JSON.parse(raw) as StoredProgress
    } catch {
      // Corrupt JSON — drop it so we don't keep retrying forever.
      try { localStorage.removeItem(key) } catch {}
      return { key, flushed: false } as const
    }

    if (!parsed?.chapterId || !parsed.locator) {
      return { key, flushed: false } as const
    }

    await upsertProgress(editionId, {
      chapterId: parsed.chapterId,
      locator: parsed.locator,
      percent: parsed.percent ?? null,
      updatedAt: new Date(parsed.updatedAt || Date.now()).toISOString(),
    })
    try { localStorage.removeItem(key) } catch {}
    return { key, flushed: true } as const
  }))

  let flushed = 0
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.flushed) flushed++
  }
  return flushed
}
