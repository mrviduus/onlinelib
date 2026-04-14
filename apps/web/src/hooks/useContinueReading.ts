import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { getLibrary, getAllProgress, type LibraryItem, type ReadingProgressDto } from '../api/auth'
import { getUserBooks, type UserBook } from '../api/userBooks'

export type ContinueBook =
  | { type: 'edition'; item: LibraryItem; progress: ReadingProgressDto }
  | { type: 'userbook'; book: UserBook }

/**
 * Returns the single most-recently-read in-progress book across library editions
 * and user uploads. Null for guests or users with no incomplete reading.
 */
export function useContinueReading(): { book: ContinueBook | null } {
  const { isAuthenticated } = useAuth()
  const [book, setBook] = useState<ContinueBook | null>(null)

  useEffect(() => {
    if (!isAuthenticated) {
      setBook(null)
      return
    }
    let cancelled = false
    Promise.all([getLibrary(), getAllProgress(), getUserBooks()])
      .then(([library, allProgress, userBooksResult]) => {
        if (cancelled) return

        const progressMap = new Map<string, ReadingProgressDto>()
        for (const p of allProgress.items) progressMap.set(p.editionId, p)

        let best: ContinueBook | null = null
        let bestUpdatedAt = ''

        for (const item of library.items) {
          const p = progressMap.get(item.editionId)
          if (!p || p.percent == null || p.percent >= 1) continue
          if (!best || p.updatedAt > bestUpdatedAt) {
            best = { type: 'edition', item, progress: p }
            bestUpdatedAt = p.updatedAt
          }
        }

        for (const ub of userBooksResult) {
          if (ub.status !== 'Ready' || !ub.progressPercent || ub.progressPercent >= 1) continue
          if (!ub.progressUpdatedAt) continue
          if (!best || ub.progressUpdatedAt > bestUpdatedAt) {
            best = { type: 'userbook', book: ub }
            bestUpdatedAt = ub.progressUpdatedAt
          }
        }

        setBook(best)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [isAuthenticated])

  return { book }
}
