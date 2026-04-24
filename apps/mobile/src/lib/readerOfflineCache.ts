import AsyncStorage from '@react-native-async-storage/async-storage'
import type { PublicHighlight } from '@textstack/shared'

type VocabEntry = { stage: number; id: string; translation?: string }
type VocabMap = Record<string, VocabEntry>

// User-scoped so a force-kill + user-switch (which bypasses signOut's
// clearReaderCache) can't leak one user's reader data to another.
const HL_PREFIX = 'reader.highlights.'
const UHL_PREFIX = 'reader.userhighlights.'
const VOCAB_PREFIX = 'reader.vocab.map.'

function hlKey(userId: string, editionId: string) { return `${HL_PREFIX}${userId}.${editionId}` }
function uhlKey(userId: string, bookId: string) { return `${UHL_PREFIX}${userId}.${bookId}` }
function vocabKey(userId: string) { return `${VOCAB_PREFIX}${userId}` }

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

// Per-key write chain: a `set` waits for the previous `set` on the same
// key to settle, so rapid get→mutate→set sequences (create-then-delete)
// can't interleave and clobber each other.
const pendingWrites = new Map<string, Promise<void>>()

function writeJson(key: string, value: unknown): Promise<void> {
  const prev = pendingWrites.get(key) || Promise.resolve()
  const next = prev.then(async () => {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Storage full / corrupted — next write wins; loss is non-critical.
    }
  }).finally(() => {
    // Only clear the slot if this promise is still the tail.
    if (pendingWrites.get(key) === next) pendingWrites.delete(key)
  })
  pendingWrites.set(key, next)
  return next
}

export const highlightCache = {
  get: (userId: string, editionId: string) => readJson<PublicHighlight[]>(hlKey(userId, editionId)),
  set: (userId: string, editionId: string, list: PublicHighlight[]) => writeJson(hlKey(userId, editionId), list),
}

export const userBookHighlightCache = {
  get: (userId: string, bookId: string) => readJson<PublicHighlight[]>(uhlKey(userId, bookId)),
  set: (userId: string, bookId: string, list: PublicHighlight[]) => writeJson(uhlKey(userId, bookId), list),
}

export const vocabMapCache = {
  get: (userId: string) => readJson<VocabMap>(vocabKey(userId)),
  set: (userId: string, map: VocabMap) => writeJson(vocabKey(userId), map),
}

export async function clearReaderCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys()
    const match = keys.filter(
      k => k.startsWith(HL_PREFIX) || k.startsWith(UHL_PREFIX) || k.startsWith(VOCAB_PREFIX),
    )
    if (match.length) await AsyncStorage.multiRemove(match)
  } catch {
    // Storage unavailable — noop.
  }
}
