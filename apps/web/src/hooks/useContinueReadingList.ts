import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getLibrary, getAllProgress, type LibraryItem, type ReadingProgressDto } from '../api/auth'
import { getUserBooks, type UserBook } from '../api/userBooks'

export type ContinueItem =
  | { kind: 'edition'; updatedAt: string; percent: number; item: LibraryItem; progress: ReadingProgressDto }
  | { kind: 'userbook'; updatedAt: string; percent: number; book: UserBook }

interface State { items: ContinueItem[]; loading: boolean }

export function useContinueReadingList(limit = 5): State {
  const { isAuthenticated } = useAuth()
  const [state, setState] = useState<State>({ items: [], loading: true })

  useEffect(() => {
    if (!isAuthenticated) {
      setState({ items: [], loading: false })
      return
    }
    let cancelled = false
    setState(s => ({ ...s, loading: true }))

    Promise.all([getLibrary(), getAllProgress(), getUserBooks()])
      .then(([library, allProgress, userBooks]) => {
        if (cancelled) return

        const progressMap = new Map<string, ReadingProgressDto>()
        for (const p of allProgress.items) progressMap.set(p.editionId, p)

        const items: ContinueItem[] = []

        for (const item of library.items) {
          const p = progressMap.get(item.editionId)
          if (!p || p.percent == null || p.percent <= 0 || p.percent >= 1) continue
          items.push({ kind: 'edition', updatedAt: p.updatedAt, percent: p.percent, item, progress: p })
        }

        for (const ub of userBooks) {
          if (ub.status !== 'Ready') continue
          const pct = ub.progressPercent ?? 0
          if (pct <= 0 || pct >= 1) continue
          if (!ub.progressUpdatedAt) continue
          items.push({ kind: 'userbook', updatedAt: ub.progressUpdatedAt, percent: pct, book: ub })
        }

        items.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
        setState({ items: items.slice(0, limit), loading: false })
      })
      .catch(() => {
        if (cancelled) return
        setState({ items: [], loading: false })
      })

    return () => { cancelled = true }
  }, [isAuthenticated, limit])

  return state
}
