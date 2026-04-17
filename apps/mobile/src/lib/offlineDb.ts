import { Platform } from 'react-native'
import type { Chapter, ChapterNav } from '@textstack/shared'

export interface CachedChapter {
  editionId: string
  chapterSlug: string
  html: string
  title: string
  wordCount: number | null
  prev: ChapterNav | null
  next: ChapterNav | null
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

let db: any = null

export async function getDb(): Promise<any> {
  if (Platform.OS === 'web') return null
  if (db) return db
  const SQLite = require('expo-sqlite')
  db = await SQLite.openDatabaseAsync('textstack-offline')
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS chapters (
      edition_id TEXT NOT NULL,
      chapter_slug TEXT NOT NULL,
      html TEXT NOT NULL,
      title TEXT NOT NULL,
      word_count INTEGER,
      prev_json TEXT,
      next_json TEXT,
      cached_at INTEGER NOT NULL,
      PRIMARY KEY (edition_id, chapter_slug)
    );
    CREATE TABLE IF NOT EXISTS cached_books (
      edition_id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      cover_path TEXT,
      total_chapters INTEGER NOT NULL,
      cached_chapters INTEGER NOT NULL DEFAULT 0,
      cached_at INTEGER NOT NULL
    );
  `)
  return db
}

// ============ CHAPTERS ============

export async function getCachedChapter(
  editionId: string,
  chapterSlug: string,
): Promise<CachedChapter | null> {
  const d = await getDb()
  if (!d) return null
  const row = await d.getFirstAsync('SELECT * FROM chapters WHERE edition_id = ? AND chapter_slug = ?', [editionId, chapterSlug]) as {
    edition_id: string
    chapter_slug: string
    html: string
    title: string
    word_count: number | null
    prev_json: string | null
    next_json: string | null
    cached_at: number
  } | null

  if (!row) return null
  return {
    editionId: row.edition_id,
    chapterSlug: row.chapter_slug,
    html: row.html,
    title: row.title,
    wordCount: row.word_count,
    prev: row.prev_json ? JSON.parse(row.prev_json) : null,
    next: row.next_json ? JSON.parse(row.next_json) : null,
    cachedAt: row.cached_at,
  }
}

export async function cacheChapter(editionId: string, chapter: Chapter): Promise<void> {
  const d = await getDb()
  if (!d) return
  await d.runAsync(
    `INSERT OR REPLACE INTO chapters (edition_id, chapter_slug, html, title, word_count, prev_json, next_json, cached_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      editionId,
      chapter.slug,
      chapter.html,
      chapter.title,
      chapter.wordCount,
      chapter.prev ? JSON.stringify(chapter.prev) : null,
      chapter.next ? JSON.stringify(chapter.next) : null,
      Date.now(),
    ],
  )
}

export async function countCachedChapters(editionId: string): Promise<number> {
  const d = await getDb()
  if (!d) return 0
  const row = await d.getFirstAsync(
    'SELECT COUNT(*) as count FROM chapters WHERE edition_id = ?',
    [editionId],
  ) as { count: number } | null
  return row?.count ?? 0
}

/**
 * Minimal chapter listing for offline rendering. Cache only stores the
 * fields we had at download time — no chapterNumber, so we sort by
 * cachedAt to roughly preserve reading order (chapters are downloaded in
 * sequence in DownloadContext).
 */
export interface CachedChapterSummary {
  slug: string
  title: string
  wordCount: number | null
}

export async function listCachedChapters(editionId: string): Promise<CachedChapterSummary[]> {
  const d = await getDb()
  if (!d) return []
  const rows = await d.getAllAsync(
    'SELECT chapter_slug, title, word_count FROM chapters WHERE edition_id = ? ORDER BY cached_at ASC',
    [editionId],
  ) as { chapter_slug: string; title: string; word_count: number | null }[]
  return rows.map(r => ({
    slug: r.chapter_slug,
    title: r.title,
    wordCount: r.word_count,
  }))
}

export async function deleteChaptersByEdition(editionId: string): Promise<void> {
  const d = await getDb()
  if (!d) return
  await d.runAsync('DELETE FROM chapters WHERE edition_id = ?', [editionId])
}

// ============ BOOK META ============

export async function getCachedBookMeta(editionId: string): Promise<CachedBookMeta | null> {
  const d = await getDb()
  if (!d) return null
  const row = await d.getFirstAsync('SELECT * FROM cached_books WHERE edition_id = ?', [editionId]) as {
    edition_id: string
    slug: string
    title: string
    cover_path: string | null
    total_chapters: number
    cached_chapters: number
    cached_at: number
  } | null

  if (!row) return null
  return {
    editionId: row.edition_id,
    slug: row.slug,
    title: row.title,
    coverPath: row.cover_path,
    totalChapters: row.total_chapters,
    cachedChapters: row.cached_chapters,
    cachedAt: row.cached_at,
  }
}

export async function setCachedBookMeta(meta: CachedBookMeta): Promise<void> {
  const d = await getDb()
  if (!d) return
  await d.runAsync(
    `INSERT OR REPLACE INTO cached_books (edition_id, slug, title, cover_path, total_chapters, cached_chapters, cached_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [meta.editionId, meta.slug, meta.title, meta.coverPath, meta.totalChapters, meta.cachedChapters, meta.cachedAt],
  )
}

export async function updateCachedChapterCount(editionId: string, cachedChapters: number): Promise<void> {
  const d = await getDb()
  if (!d) return
  await d.runAsync('UPDATE cached_books SET cached_chapters = ? WHERE edition_id = ?', [cachedChapters, editionId])
}

export async function deleteCachedBook(editionId: string): Promise<void> {
  const d = await getDb()
  if (!d) return
  await d.runAsync('DELETE FROM chapters WHERE edition_id = ?', [editionId])
  await d.runAsync('DELETE FROM cached_books WHERE edition_id = ?', [editionId])
}

export async function getAllCachedBooks(): Promise<CachedBookMeta[]> {
  const d = await getDb()
  if (!d) return []
  const rows = await d.getAllAsync('SELECT * FROM cached_books ORDER BY cached_at DESC') as {
    edition_id: string
    slug: string
    title: string
    cover_path: string | null
    total_chapters: number
    cached_chapters: number
    cached_at: number
  }[]

  return rows.map((row: any) => ({
    editionId: row.edition_id,
    slug: row.slug,
    title: row.title,
    coverPath: row.cover_path,
    totalChapters: row.total_chapters,
    cachedChapters: row.cached_chapters,
    cachedAt: row.cached_at,
  }))
}

export async function isBookFullyCached(editionId: string): Promise<boolean> {
  const meta = await getCachedBookMeta(editionId)
  if (!meta) return false
  return meta.cachedChapters >= meta.totalChapters
}
