import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { libraryApi, readingProgressApi, userBooksApi } from '@textstack/shared'
import type { UserLibraryItem, ReadingProgressDto, UserBookDto } from '@textstack/shared'
import { useAuth } from '../context/AuthContext'

export type ContinueItem =
  | { kind: 'edition'; updatedAt: string; percent: number; item: UserLibraryItem; progress: ReadingProgressDto }
  | { kind: 'userbook'; updatedAt: string; percent: number; book: UserBookDto }

interface State { items: ContinueItem[]; loading: boolean }

export function useContinueReadingList(limit = 5): State {
  const { isAuthenticated } = useAuth()
  const [state, setState] = useState<State>({ items: [], loading: true })

  useFocusEffect(useCallback(() => {
    if (!isAuthenticated) {
      setState({ items: [], loading: false })
      return
    }
    let cancelled = false
    setState(s => ({ ...s, loading: true }))

    Promise.all([
      libraryApi.getLibrary().catch(() => [] as UserLibraryItem[]),
      readingProgressApi.getAllProgress().catch(() => [] as ReadingProgressDto[]),
      userBooksApi.getUserBooks().catch(() => [] as UserBookDto[]),
    ])
      .then(([library, allProgress, userBooks]) => {
        if (cancelled) return

        const progressMap = new Map<string, ReadingProgressDto>()
        for (const p of allProgress) progressMap.set(p.editionId, p)

        const items: ContinueItem[] = []

        for (const item of library) {
          const p = progressMap.get(item.editionId)
          if (!p || p.percent == null || p.percent <= 0 || p.percent >= 1) continue
          if (!p.chapterSlug) continue
          items.push({ kind: 'edition', updatedAt: p.updatedAt, percent: p.percent, item, progress: p })
        }

        for (const ub of userBooks) {
          if (ub.status.toLowerCase() !== 'ready') continue
          const pct = ub.progressPercent ?? 0
          if (pct <= 0 || pct >= 1) continue
          if (!ub.progressUpdatedAt) continue
          if (!ub.progressChapterSlug) continue
          items.push({ kind: 'userbook', updatedAt: ub.progressUpdatedAt, percent: pct, book: ub })
        }

        items.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
        setState({ items: items.slice(0, limit), loading: false })
      })
      .catch((err) => {
        if (cancelled) return
        console.warn('[ContinueReadingShelf] failed to load shelf data', err)
        setState({ items: [], loading: false })
      })

    return () => { cancelled = true }
  }, [isAuthenticated, limit]))

  return state
}
