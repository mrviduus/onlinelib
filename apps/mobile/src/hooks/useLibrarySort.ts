import { useCallback, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { UserLibraryItem, UserBookDto, ReadingProgressDto } from '@textstack/shared'

export type LibrarySortKey = 'recent' | 'added' | 'title' | 'author' | 'progress'
export type LibraryTab = 'saved' | 'uploads'

const STORAGE_PREFIX = 'textstack_library_sort_'
const VALID: LibrarySortKey[] = ['recent', 'added', 'title', 'author', 'progress']
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

function isValid(v: unknown): v is LibrarySortKey {
  return typeof v === 'string' && (VALID as string[]).includes(v)
}

export function useLibrarySort(tab: LibraryTab) {
  const [sort, setSortState] = useState<LibrarySortKey>('recent')

  useEffect(() => {
    let cancelled = false
    AsyncStorage.getItem(STORAGE_PREFIX + tab)
      .then(v => { if (!cancelled) setSortState(isValid(v) ? v : 'recent') })
      .catch(() => { if (!cancelled) setSortState('recent') })
    return () => { cancelled = true }
  }, [tab])

  const setSort = useCallback((next: LibrarySortKey) => {
    setSortState(next)
    AsyncStorage.setItem(STORAGE_PREFIX + tab, next).catch(() => {})
  }, [tab])

  return { sort, setSort }
}

export function sortLibraryItems(
  items: UserLibraryItem[],
  sort: LibrarySortKey,
  progressMap: Record<string, ReadingProgressDto>,
): UserLibraryItem[] {
  const copy = [...items]
  switch (sort) {
    case 'title':
      return copy.sort((a, b) => collator.compare(a.title || '', b.title || ''))
    case 'added':
      return copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    case 'progress':
      return copy.sort((a, b) => (progressMap[b.editionId]?.percent ?? 0) - (progressMap[a.editionId]?.percent ?? 0))
    case 'author':
      return copy.sort((a, b) => {
        const aa = a.author || ''
        const ab = b.author || ''
        if (!aa && !ab) return 0
        if (!aa) return 1
        if (!ab) return -1
        return collator.compare(aa, ab)
      })
    case 'recent':
    default:
      return copy.sort((a, b) => {
        const at = progressMap[a.editionId]?.updatedAt || a.createdAt
        const bt = progressMap[b.editionId]?.updatedAt || b.createdAt
        return new Date(bt).getTime() - new Date(at).getTime()
      })
  }
}

export function sortUserBooks(books: UserBookDto[], sort: LibrarySortKey): UserBookDto[] {
  const stickyTop: UserBookDto[] = []
  const ready: UserBookDto[] = []
  for (const b of books) {
    const s = b.status.toLowerCase()
    if (s === 'ready' || s === 'completed') ready.push(b)
    else stickyTop.push(b)
  }
  stickyTop.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  switch (sort) {
    case 'title':
      ready.sort((a, b) => collator.compare(a.title || '', b.title || ''))
      break
    case 'author':
      ready.sort((a, b) => {
        if (!a.author && !b.author) return 0
        if (!a.author) return 1
        if (!b.author) return -1
        return collator.compare(a.author, b.author)
      })
      break
    case 'added':
      ready.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      break
    case 'progress':
      ready.sort((a, b) => (b.progressPercent ?? 0) - (a.progressPercent ?? 0))
      break
    case 'recent':
    default:
      ready.sort((a, b) => {
        const at = a.progressUpdatedAt || a.createdAt
        const bt = b.progressUpdatedAt || b.createdAt
        return new Date(bt).getTime() - new Date(at).getTime()
      })
      break
  }

  return [...stickyTop, ...ready]
}
