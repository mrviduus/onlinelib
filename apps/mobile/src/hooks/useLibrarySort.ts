import { useCallback, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type LibrarySortKey = 'recent' | 'added' | 'title' | 'author' | 'progress'
/** Persistence scope. One library, so one scope — it used to be per tab. */
export type LibraryScope = 'library'

const STORAGE_PREFIX = 'textstack_library_sort_'
const VALID: LibrarySortKey[] = ['recent', 'added', 'title', 'author', 'progress']

function isValid(v: unknown): v is LibrarySortKey {
  return typeof v === 'string' && (VALID as string[]).includes(v)
}

export function useLibrarySort(scope: LibraryScope) {
  const [sort, setSortState] = useState<LibrarySortKey>('recent')

  useEffect(() => {
    let cancelled = false
    AsyncStorage.getItem(STORAGE_PREFIX + scope)
      .then(v => { if (!cancelled) setSortState(isValid(v) ? v : 'recent') })
      .catch(() => { if (!cancelled) setSortState('recent') })
    return () => { cancelled = true }
  }, [scope])

  const setSort = useCallback((next: LibrarySortKey) => {
    setSortState(next)
    AsyncStorage.setItem(STORAGE_PREFIX + scope, next).catch(() => {})
  }, [scope])

  return { sort, setSort }
}
