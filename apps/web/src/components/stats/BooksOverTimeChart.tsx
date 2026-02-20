import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import type { BooksOverTimeDto } from '../../api/readingTracking'
import { useTranslation } from '../../hooks/useTranslation'

interface Props {
  data: BooksOverTimeDto[]
}

export function BooksOverTimeChart({ data }: Props) {
  const { t } = useTranslation()
  if (data.length === 0) return null

  return (
    <section id="books-over-time" className="stats-chart-section">
      <h3 className="stats-chart-section__title">{t('stats.booksOverTime')}</h3>
      <div className="stats-chart-container" style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: 0, right: 20, top: 10, bottom: 0 }}>
            <XAxis dataKey="period" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="books" allowDecimals={false} />
            <YAxis yAxisId="pages" orientation="right" allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Line yAxisId="books" type="monotone" dataKey="books" name={t('stats.books')} stroke="var(--color-brand, #C4704B)" strokeWidth={2} dot={{ r: 3 }} />
            <Line yAxisId="pages" type="monotone" dataKey="pages" name={t('stats.pages')} stroke="#8b4513" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
