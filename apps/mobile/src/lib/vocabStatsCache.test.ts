import { describe, it, expect, beforeEach } from 'vitest'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { VocabularyStatsDto } from '@textstack/shared'
import { saveVocabStatsCache, getVocabStatsCache, clearVocabStatsCache } from './vocabStatsCache'

const MockedStorage = AsyncStorage as unknown as { __reset(): void }
const STORAGE_KEY = 'vocab.stats.last.v2'

// Minimal stats fixture — anything with totalWords passes validation.
// Full DTO has nested byStage / dailyCap / weeklyProgress; we cast through
// unknown because the cache validator only checks totalWords + cachedAt.
function fxStats(overrides: Partial<VocabularyStatsDto> = {}): VocabularyStatsDto {
  return {
    totalWords: 42,
    byStage: { new: 7, recognition: 10, recall: 10, context: 10, mastered: 5 },
    dueNow: 0,
    retiredCount: 0,
    pendingCount: 0,
    lookupCount: 0,
    clusterCount: 0,
    dailyCap: { used: 0, cap: 15, remaining: 15 },
    weeklyProgress: { used: 0, budget: 70, remaining: 70, resetAt: '' },
    ...overrides,
  } as unknown as VocabularyStatsDto
}

describe('saveVocabStatsCache → getVocabStatsCache (round-trip)', () => {
  beforeEach(() => MockedStorage.__reset())

  it('writes and reads back the stats payload', async () => {
    await saveVocabStatsCache(fxStats({ totalWords: 100, retiredCount: 12 }))
    const cached = await getVocabStatsCache()
    expect(cached).not.toBeNull()
    expect(cached!.stats.totalWords).toBe(100)
    expect(cached!.stats.retiredCount).toBe(12)
  })

  it('cachedAt is set to a recent epoch ms', async () => {
    const before = Date.now()
    await saveVocabStatsCache(fxStats())
    const after = Date.now()
    const cached = await getVocabStatsCache()
    expect(cached!.cachedAt).toBeGreaterThanOrEqual(before)
    expect(cached!.cachedAt).toBeLessThanOrEqual(after)
  })

  it('subsequent save overwrites prior value', async () => {
    await saveVocabStatsCache(fxStats({ totalWords: 1 }))
    await saveVocabStatsCache(fxStats({ totalWords: 999 }))
    expect((await getVocabStatsCache())!.stats.totalWords).toBe(999)
  })
})

describe('getVocabStatsCache — defensive reads', () => {
  beforeEach(() => MockedStorage.__reset())

  it('returns null for empty store', async () => {
    expect(await getVocabStatsCache()).toBeNull()
  })

  it('returns null for corrupted JSON', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, 'not-valid-json{{{')
    expect(await getVocabStatsCache()).toBeNull()
  })

  it('returns null when payload missing cachedAt', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
      stats: fxStats(),
    }))
    expect(await getVocabStatsCache()).toBeNull()
  })

  it('returns null when payload missing stats object', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
      cachedAt: Date.now(),
    }))
    expect(await getVocabStatsCache()).toBeNull()
  })

  it('returns null when stats.totalWords missing (schema drift defense)', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
      cachedAt: Date.now(),
      stats: { dueNow: 5 }, // no totalWords
    }))
    expect(await getVocabStatsCache()).toBeNull()
  })

  it('returns null when cachedAt is a string (wrong type)', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
      cachedAt: '2026-05-23',
      stats: fxStats(),
    }))
    expect(await getVocabStatsCache()).toBeNull()
  })
})

describe('clearVocabStatsCache', () => {
  beforeEach(() => MockedStorage.__reset())

  it('removes the cache entry', async () => {
    await saveVocabStatsCache(fxStats())
    expect(await getVocabStatsCache()).not.toBeNull()
    await clearVocabStatsCache()
    expect(await getVocabStatsCache()).toBeNull()
  })

  it('does not throw when cache already empty', async () => {
    await expect(clearVocabStatsCache()).resolves.not.toThrow()
  })
})
