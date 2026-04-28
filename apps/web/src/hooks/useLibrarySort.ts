import { useCallback, useEffect, useState } from 'react'
import type { LibraryItem, ReadingProgressDto } from '../api/auth'
import type { UserBook } from '../api/userBooks'

export type LibrarySortKey = 'recent' | 'added' | 'title' | 'author' | 'progress'
export type LibraryTab = 'saved' | 'uploads'

const VALID_KEYS: LibrarySortKey[] = ['recent', 'added', 'title', 'author', 'progress']
const STORAGE_PREFIX = 'textstack_library_sort_'

function readStored(tab: LibraryTab): LibrarySortKey {
  try {
    const v = localStorage.getItem(STORAGE_PREFIX + tab)
    if (v && (VALID_KEYS as string[]).includes(v)) return v as LibrarySortKey
  } catch { /* SSR / locked storage */ }
  return 'recent'
}

export function useLibrarySort(tab: LibraryTab) {
  const [sort, setSortState] = useState<LibrarySortKey>(() => readStored(tab))

  // Re-read when tab swaps so each tab keeps its own remembered choice.
  useEffect(() => { setSortState(readStored(tab)) }, [tab])

  const setSort = useCallback((next: LibrarySortKey) => {
    setSortState(next)
    try { localStorage.setItem(STORAGE_PREFIX + tab, next) } catch { /* ignore */ }
  }, [tab])

  return { sort, setSort }
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

function timeOf(s: string | null | undefined): number {
  if (!s) return 0
  const t = Date.parse(s)
  return Number.isNaN(t) ? 0 : t
}

export function sortLibraryItems(
  items: LibraryItem[],
  sort: LibrarySortKey,
  progressMap: Record<string, ReadingProgressDto>,
): LibraryItem[] {
  const arr = [...items]
  arr.sort((a, b) => {
    switch (sort) {
      case 'title':
        return collator.compare(a.title || '', b.title || '')
      case 'added':
        return timeOf(b.createdAt) - timeOf(a.createdAt)
      case 'progress': {
        const pa = progressMap[a.editionId]?.percent ?? 0
        const pb = progressMap[b.editionId]?.percent ?? 0
        return pb - pa
      }
      case 'author':
        // LibraryItem has no author — keep stable order so the menu still works.
        return 0
      case 'recent':
      default: {
        const ta = timeOf(progressMap[a.editionId]?.updatedAt) || timeOf(a.createdAt)
        const tb = timeOf(progressMap[b.editionId]?.updatedAt) || timeOf(b.createdAt)
        return tb - ta
      }
    }
  })
  return arr
}

function isReady(b: UserBook): boolean {
  return b.status === 'Ready'
}

// Books still processing or failed always pin to the top — they need attention
// regardless of the user's chosen sort. Within each partition, apply the sort.
export function sortUserBooks(books: UserBook[], sort: LibrarySortKey): UserBook[] {
  const cmp = (a: UserBook, b: UserBook): number => {
    switch (sort) {
      case 'title':
        return collator.compare(a.title || '', b.title || '')
      case 'added':
        return timeOf(b.createdAt) - timeOf(a.createdAt)
      case 'author':
        if (!a.author && !b.author) return 0
        if (!a.author) return 1
        if (!b.author) return -1
        return collator.compare(a.author, b.author)
      case 'progress':
        return (b.progressPercent ?? 0) - (a.progressPercent ?? 0)
      case 'recent':
      default:
        return timeOf(b.progressUpdatedAt || b.createdAt) - timeOf(a.progressUpdatedAt || a.createdAt)
    }
  }
  const attention = books.filter(b => !isReady(b)).sort((a, b) => timeOf(b.createdAt) - timeOf(a.createdAt))
  const ready = books.filter(isReady).sort(cmp)
  return [...attention, ...ready]
}
