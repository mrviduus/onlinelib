/**
 * Last-known vocabulary stats cache (AsyncStorage).
 *
 * Why: VocabularyReviewCard on the home screen fetches stats via
 * `vocabularyApi.getVocabularyStats()`. If the device is offline or
 * unauthenticated, the call throws. Without a cache we'd render the empty
 * "Start your vocabulary" state even for a user with 500 saved words —
 * which is actively misleading.
 *
 * Contract: writes are fire-and-forget, reads return `null` on any error
 * (missing, corrupted, storage unavailable). Callers should render stale
 * cached stats while the network fetch races, then swap when it resolves.
 * TTL is soft — we let the network result override any cached value
 * regardless of age.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import type { VocabularyStatsDto } from '@textstack/shared'

// Bumped to v2 with the anti-spiral fields (weeklyProgress, retiredCount).
// Old cached payloads would render a card without the weekly budget state.
const STORAGE_KEY = 'vocab.stats.last.v2'

export interface CachedVocabStats {
  stats: VocabularyStatsDto
  cachedAt: number // epoch ms
}

export async function saveVocabStatsCache(stats: VocabularyStatsDto): Promise<void> {
  try {
    const payload: CachedVocabStats = { stats, cachedAt: Date.now() }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Non-critical — next successful fetch will re-seed.
  }
}

export async function getVocabStatsCache(): Promise<CachedVocabStats | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (
      !parsed ||
      typeof parsed.cachedAt !== 'number' ||
      !parsed.stats ||
      typeof parsed.stats.totalWords !== 'number'
    ) {
      return null
    }
    return parsed as CachedVocabStats
  } catch {
    return null
  }
}

export async function clearVocabStatsCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore.
  }
}
