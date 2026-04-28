import { useCallback, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { UserLibraryItem, UserBookDto, ReadingProgressDto } from '@textstack/shared'

export type LibraryFilterKey = 'all' | 'reading' | 'finished' | 'notStarted' | 'failed'
export type LibraryTab = 'saved' | 'uploads'

const STORAGE_PREFIX = 'textstack_library_filter_'
const VALID: LibraryFilterKey[] = ['all', 'reading', 'finished', 'notStarted', 'failed']
const FINISHED_THRESHOLD = 0.95

function isValid(v: unknown): v is LibraryFilterKey {
  return typeof v === 'string' && (VALID as string[]).includes(v)
}

export function useLibraryFilter(tab: LibraryTab) {
  const [filter, setFilterState] = useState<LibraryFilterKey>('all')

  useEffect(() => {
    let cancelled = false
    AsyncStorage.getItem(STORAGE_PREFIX + tab)
      .then(v => { if (!cancelled) setFilterState(isValid(v) ? v : 'all') })
      .catch(() => { if (!cancelled) setFilterState('all') })
    return () => { cancelled = true }
  }, [tab])

  const setFilter = useCallback((next: LibraryFilterKey) => {
    setFilterState(next)
    AsyncStorage.setItem(STORAGE_PREFIX + tab, next).catch(() => {})
  }, [tab])

  return { filter, setFilter }
}

function isReady(s: string): boolean {
  const v = s.toLowerCase()
  return v === 'ready' || v === 'completed'
}

export function filterLibraryItems(
  items: UserLibraryItem[],
  filter: LibraryFilterKey,
  progressMap: Record<string, ReadingProgressDto>,
): UserLibraryItem[] {
  switch (filter) {
    case 'reading':
      return items.filter(i => { const p = progressMap[i.editionId]?.percent ?? 0; return p > 0 && p < FINISHED_THRESHOLD })
    case 'finished':
      return items.filter(i => (progressMap[i.editionId]?.percent ?? 0) >= FINISHED_THRESHOLD)
    case 'notStarted':
      return items.filter(i => (progressMap[i.editionId]?.percent ?? 0) === 0)
    case 'failed':
      return []
    case 'all':
    default:
      return items
  }
}

export function filterUserBooks(books: UserBookDto[], filter: LibraryFilterKey): UserBookDto[] {
  switch (filter) {
    case 'reading':
      return books.filter(b => {
        if (!isReady(b.status) || b.completedAt) return false
        const p = b.progressPercent ?? 0
        return p > 0 && p < FINISHED_THRESHOLD
      })
    case 'finished':
      return books.filter(b => isReady(b.status) && (b.completedAt != null || (b.progressPercent ?? 0) >= FINISHED_THRESHOLD))
    case 'notStarted':
      return books.filter(b => isReady(b.status) && !b.completedAt && (b.progressPercent ?? 0) === 0)
    case 'failed':
      return books.filter(b => b.status.toLowerCase() === 'failed')
    case 'all':
    default:
      return books
  }
}

export function countsForLibrary(
  items: UserLibraryItem[],
  progressMap: Record<string, ReadingProgressDto>,
): Record<LibraryFilterKey, number> {
  return {
    all: items.length,
    reading: filterLibraryItems(items, 'reading', progressMap).length,
    finished: filterLibraryItems(items, 'finished', progressMap).length,
    notStarted: filterLibraryItems(items, 'notStarted', progressMap).length,
    failed: 0,
  }
}

export function countsForUploads(books: UserBookDto[]): Record<LibraryFilterKey, number> {
  return {
    all: books.length,
    reading: filterUserBooks(books, 'reading').length,
    finished: filterUserBooks(books, 'finished').length,
    notStarted: filterUserBooks(books, 'notStarted').length,
    failed: filterUserBooks(books, 'failed').length,
  }
}
