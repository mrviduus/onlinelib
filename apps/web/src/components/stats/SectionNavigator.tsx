import { useTranslation } from '../../hooks/useTranslation'

const SECTIONS = [
  { id: 'summary', key: 'stats.summary' },
  { id: 'streaks', key: 'stats.streaks' },
  { id: 'pace', key: 'stats.pace' },
  { id: 'genres', key: 'stats.genres' },
  { id: 'authors', key: 'stats.authors' },
  { id: 'languages', key: 'stats.languages' },
  { id: 'books-over-time', key: 'stats.booksOverTime' },
  { id: 'book-length', key: 'stats.bookLength' },
  { id: 'ratings', key: 'stats.ratings' },
  { id: 'achievements', key: 'stats.achievements' },
]

export function SectionNavigator() {
  const { t } = useTranslation()

  return (
    <select
      className="stats-filter__select"
      value=""
      onChange={(e) => {
        const el = document.getElementById(e.target.value)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        e.target.value = ''
      }}
    >
      <option value="" disabled>{t('stats.contents')}</option>
      {SECTIONS.map((s) => (
        <option key={s.id} value={s.id}>{t(s.key)}</option>
      ))}
    </select>
  )
}
