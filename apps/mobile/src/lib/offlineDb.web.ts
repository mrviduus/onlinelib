// Web stub for offlineDb. The native implementation pulls in expo-sqlite,
// which transitively imports `.wasm` via its web shim — Metro's web bundler
// can't resolve that, breaking `eas update --platform=all`.
//
// We don't ship offline reading on web (DownloadContext also no-ops for web),
// so every export here is a safe no-op that satisfies the same surface the
// native module exposes.
//
// If a web feature ever needs offline persistence, replace these stubs with
// IndexedDB-backed implementations rather than re-introducing expo-sqlite on
// web.

import type { Chapter } from '@textstack/shared'

export interface CachedChapter {
  editionId: string
  chapterSlug: string
  html: string
  title: string
  wordCount: number | null
  prev: { chapterNumber: number; slug: string; title: string } | null
  next: { chapterNumber: number; slug: string; title: string } | null
  cachedAt: number
}

export interface CachedBookMeta {
  editionId: string
  slug: string
  title: string
  coverPath: string | null
  totalChapters: number
  cachedChapters: number
  cachedAt: number
}

export interface CachedChapterSummary {
  chapterSlug: string
  title: string
  cachedAt: number
}

export async function getDb(): Promise<null> {
  return null
}

export async function getCachedChapter(): Promise<CachedChapter | null> {
  return null
}

export async function cacheChapter(_editionId: string, _chapter: Chapter): Promise<void> {
  /* no-op on web */
}

export async function countCachedChapters(): Promise<number> {
  return 0
}

export async function listCachedChapters(): Promise<CachedChapterSummary[]> {
  return []
}

export async function deleteChaptersByEdition(): Promise<void> {
  /* no-op */
}

export async function getCachedBookMeta(): Promise<CachedBookMeta | null> {
  return null
}

export async function setCachedBookMeta(_meta: CachedBookMeta): Promise<void> {
  /* no-op */
}

export async function updateCachedChapterCount(): Promise<void> {
  /* no-op */
}

export async function deleteCachedBook(): Promise<void> {
  /* no-op */
}

export async function getAllCachedBooks(): Promise<CachedBookMeta[]> {
  return []
}

export async function isBookFullyCached(): Promise<boolean> {
  return false
}
