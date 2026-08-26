/**
 * One library, two storage shapes.
 *
 * A user's books arrive from two endpoints — catalog editions they bookmarked
 * (`UserLibraryItem`, progress held separately in `ReadingProgress`) and files
 * they uploaded (`UserBookDto`, progress carried inline). That split is a
 * storage and ownership detail; to the reader they are simply their books.
 *
 * Mobile used to render them as two lists behind two tabs labelled "Saved" and
 * "Uploads" — table names, surfaced as navigation. This module tags each record
 * with its `kind` and exposes accessors, so a single list can interleave both
 * and every screen asks the same questions of both.
 *
 * Pure and I/O-free. The mobile hooks own persistence; this owns the semantics.
 */

import type { UserLibraryItem, UserBookDto, ReadingProgressDto } from '../types/api'

export type LibraryEntry =
  | { kind: 'saved'; item: UserLibraryItem }
  | { kind: 'upload'; book: UserBookDto }

/** Where a book came from. Used as a filter, never as navigation. */
export type LibraryEntrySource = 'all' | 'uploads' | 'catalog'

/** Where the reader is with a book. */
export type LibraryEntryStatus = 'all' | 'reading' | 'finished' | 'notStarted' | 'failed'

export type LibraryEntrySort = 'recent' | 'added' | 'title' | 'author' | 'progress'

/** Progress at or above this counts as finished — the last few percent of a
 *  book are front/back matter often never scrolled through. */
export const FINISHED_THRESHOLD = 0.95

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

function timeOf(s: string | null | undefined): number {
  if (!s) return 0
  const t = Date.parse(s)
  return Number.isFinite(t) ? t : 0
}

function isReady(status: string): boolean {
  const v = status.toLowerCase()
  return v === 'ready' || v === 'completed'
}

// --- accessors -------------------------------------------------------------

/** Stable list key. Prefixed because an edition id and a user-book id could
 *  otherwise collide in a merged list. */
export function entryKey(e: LibraryEntry): string {
  return e.kind === 'saved' ? `saved:${e.item.editionId}` : `upload:${e.book.id}`
}

export function entryTitle(e: LibraryEntry): string {
  return (e.kind === 'saved' ? e.item.title : e.book.title) || ''
}

export function entryAuthor(e: LibraryEntry): string {
  return (e.kind === 'saved' ? e.item.author : e.book.author) || ''
}

export function entryCoverPath(e: LibraryEntry): string | null {
  return e.kind === 'saved' ? e.item.coverPath : e.book.coverPath
}

export function entryCreatedAt(e: LibraryEntry): string {
  return e.kind === 'saved' ? e.item.createdAt : e.book.createdAt
}

/** 0..1. Catalog progress lives in a separate map; upload progress is inline. */
export function entryProgress(
  e: LibraryEntry,
  progressMap: Record<string, ReadingProgressDto>,
): number {
  if (e.kind === 'saved') return progressMap[e.item.editionId]?.percent ?? 0
  return e.book.progressPercent ?? 0
}

/** Last activity, falling back to when the book entered the library so a
 *  never-opened book still sorts sensibly instead of sinking to the bottom. */
export function entryUpdatedAt(
  e: LibraryEntry,
  progressMap: Record<string, ReadingProgressDto>,
): number {
  if (e.kind === 'saved') {
    return timeOf(progressMap[e.item.editionId]?.updatedAt) || timeOf(e.item.createdAt)
  }
  return timeOf(e.book.progressUpdatedAt) || timeOf(e.book.createdAt)
}

/** True while an upload is still being parsed, or failed. Catalog books are
 *  never in this state — they were parsed long before the user saw them. */
export function entryNeedsAttention(e: LibraryEntry): boolean {
  return e.kind === 'upload' && !isReady(e.book.status)
}

// --- building, filtering, counting ------------------------------------------

export function buildLibraryEntries(
  library: UserLibraryItem[],
  userBooks: UserBookDto[],
  source: LibraryEntrySource = 'all',
): LibraryEntry[] {
  const entries: LibraryEntry[] = []
  if (source === 'all' || source === 'catalog') {
    for (const item of library) entries.push({ kind: 'saved', item })
  }
  if (source === 'all' || source === 'uploads') {
    for (const book of userBooks) entries.push({ kind: 'upload', book })
  }
  return entries
}

export function matchesStatus(
  e: LibraryEntry,
  status: LibraryEntryStatus,
  progressMap: Record<string, ReadingProgressDto>,
): boolean {
  if (status === 'all') return true

  if (e.kind === 'upload') {
    if (status === 'failed') return e.book.status.toLowerCase() === 'failed'
    if (!isReady(e.book.status)) return false
    const p = e.book.progressPercent ?? 0
    switch (status) {
      case 'reading': return !e.book.completedAt && p > 0 && p < FINISHED_THRESHOLD
      case 'finished': return e.book.completedAt != null || p >= FINISHED_THRESHOLD
      case 'notStarted': return !e.book.completedAt && p === 0
    }
    return false
  }

  // A catalog book cannot fail — nothing about it is processed for this user.
  if (status === 'failed') return false
  const p = entryProgress(e, progressMap)
  switch (status) {
    case 'reading': return p > 0 && p < FINISHED_THRESHOLD
    case 'finished': return p >= FINISHED_THRESHOLD
    case 'notStarted': return p === 0
  }
  return false
}

export function filterEntries(
  entries: LibraryEntry[],
  status: LibraryEntryStatus,
  progressMap: Record<string, ReadingProgressDto>,
): LibraryEntry[] {
  if (status === 'all') return entries
  return entries.filter(e => matchesStatus(e, status, progressMap))
}

export function countEntries(
  entries: LibraryEntry[],
  progressMap: Record<string, ReadingProgressDto>,
): Record<LibraryEntryStatus, number> {
  const counts: Record<LibraryEntryStatus, number> = {
    all: entries.length, reading: 0, finished: 0, notStarted: 0, failed: 0,
  }
  for (const e of entries) {
    if (matchesStatus(e, 'reading', progressMap)) counts.reading++
    if (matchesStatus(e, 'finished', progressMap)) counts.finished++
    if (matchesStatus(e, 'notStarted', progressMap)) counts.notStarted++
    if (matchesStatus(e, 'failed', progressMap)) counts.failed++
  }
  return counts
}

// --- sorting ----------------------------------------------------------------

/**
 * Sorted copy. Books needing attention (still processing, or failed) are
 * pinned to the top regardless of the chosen key — a failed upload the reader
 * cannot see is a failed upload they never retry.
 */
export function sortEntries(
  entries: LibraryEntry[],
  sort: LibraryEntrySort,
  progressMap: Record<string, ReadingProgressDto>,
): LibraryEntry[] {
  const rank = (e: LibraryEntry) => (entryNeedsAttention(e) ? 0 : 1)

  return [...entries].sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    if (ra !== rb) return ra - rb

    switch (sort) {
      case 'title':
        return collator.compare(entryTitle(a), entryTitle(b))
      case 'author': {
        const aa = entryAuthor(a)
        const ab = entryAuthor(b)
        // Unknown authors sort last rather than clustering under "".
        if (!aa && !ab) return 0
        if (!aa) return 1
        if (!ab) return -1
        return collator.compare(aa, ab)
      }
      case 'added':
        return timeOf(entryCreatedAt(b)) - timeOf(entryCreatedAt(a))
      case 'progress':
        return entryProgress(b, progressMap) - entryProgress(a, progressMap)
      case 'recent':
      default:
        return entryUpdatedAt(b, progressMap) - entryUpdatedAt(a, progressMap)
    }
  })
}
