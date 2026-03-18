import { useState, useEffect } from 'react'
import { useApi } from '../../hooks/useApi'
import { useTranslation } from '../../hooks/useTranslation'

export function StatsBar() {
  const { t } = useTranslation()
  const api = useApi()
  const [stats, setStats] = useState<{ books: number; authors: number; genres: number } | null>(null)

  useEffect(() => {
    Promise.all([
      api.getBooks({ limit: 1 }),
      api.getAuthors({ limit: 1 }),
      api.getGenres(),
    ])
      .then(([books, authors, genres]) => {
        setStats({ books: books.total, authors: authors.total, genres: genres.total })
      })
      .catch(() => {})
  }, [api])

  if (!stats) return null

  const fmt = (n: number) => n.toLocaleString()

  return (
    <div className="home-stats">
      <span>{fmt(stats.books)} {t('home.stats.books')}</span>
      <span className="home-stats__dot">&middot;</span>
      <span>{fmt(stats.authors)} {t('home.stats.authors')}</span>
      <span className="home-stats__dot">&middot;</span>
      <span>{fmt(stats.genres)} {t('home.stats.genres')}</span>
    </div>
  )
}
