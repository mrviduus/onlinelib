import AsyncStorage from '@react-native-async-storage/async-storage'
import type { PublicHighlight } from '@textstack/shared'

type VocabEntry = { stage: number; id: string; translation?: string }
type VocabMap = Record<string, VocabEntry>

const HL_PREFIX = 'reader.highlights.'
const UHL_PREFIX = 'reader.userhighlights.'
const VOCAB_KEY = 'reader.vocab.map'

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full / corrupted — next write wins; loss is non-critical.
  }
}

export const highlightCache = {
  get: (editionId: string) => readJson<PublicHighlight[]>(`${HL_PREFIX}${editionId}`),
  set: (editionId: string, list: PublicHighlight[]) => writeJson(`${HL_PREFIX}${editionId}`, list),
}

export const userBookHighlightCache = {
  get: (bookId: string) => readJson<PublicHighlight[]>(`${UHL_PREFIX}${bookId}`),
  set: (bookId: string, list: PublicHighlight[]) => writeJson(`${UHL_PREFIX}${bookId}`, list),
}

export const vocabMapCache = {
  get: () => readJson<VocabMap>(VOCAB_KEY),
  set: (map: VocabMap) => writeJson(VOCAB_KEY, map),
}

export async function clearReaderCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys()
    const match = keys.filter(
      k => k.startsWith(HL_PREFIX) || k.startsWith(UHL_PREFIX) || k === VOCAB_KEY,
    )
    if (match.length) await AsyncStorage.multiRemove(match)
  } catch {
    // Storage unavailable — noop.
  }
}
