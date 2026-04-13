import AsyncStorage from '@react-native-async-storage/async-storage'

const KEY_PREFIX = 'reading.progress.'

export interface LocalProgress {
  chapterId: string
  chapterSlug: string
  locator?: string
  percent: number
  /** Epoch ms. Source of truth for LWW merge between local and server. */
  updatedAt: number
}

/** Persist progress for a single edition. Never throws — callers can fire-and-forget. */
export async function saveLocalProgress(editionId: string, data: LocalProgress): Promise<void> {
  try {
    await AsyncStorage.setItem(`${KEY_PREFIX}${editionId}`, JSON.stringify(data))
  } catch {
    // Out of space / corrupted store — progress still goes to server on the next flush.
  }
}

export async function getLocalProgress(editionId: string): Promise<LocalProgress | null> {
  try {
    const raw = await AsyncStorage.getItem(`${KEY_PREFIX}${editionId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed.updatedAt !== 'number') return null
    return parsed as LocalProgress
  } catch {
    return null
  }
}

/** Load all cached progress records keyed by editionId. Used by home/continue-reading. */
export async function getAllLocalProgress(): Promise<Map<string, LocalProgress>> {
  const map = new Map<string, LocalProgress>()
  try {
    const keys = await AsyncStorage.getAllKeys()
    const progressKeys = keys.filter(k => k.startsWith(KEY_PREFIX))
    if (progressKeys.length === 0) return map
    const pairs = await AsyncStorage.multiGet(progressKeys)
    for (const [k, v] of pairs) {
      if (!v) continue
      try {
        const parsed = JSON.parse(v)
        if (!parsed || typeof parsed.updatedAt !== 'number') continue
        map.set(k.slice(KEY_PREFIX.length), parsed as LocalProgress)
      } catch {
        // Skip corrupted entry.
      }
    }
  } catch {
    // Storage unavailable — return empty.
  }
  return map
}
