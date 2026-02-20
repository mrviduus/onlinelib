import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { RatingBucketDto } from '../../api/readingTracking'
import { useTranslation } from '../../hooks/useTranslation'

interface Props {
  data: RatingBucketDto[]
  avgRating: number | null
}

export function RatingChart({ data, avgRating }: Props) {
  const { t } = useTranslation()
  if (data.length === 0) return null

  const chartData = data.map(d => ({
    name: `${'★'.repeat(d.rating)}`,
    count: d.count,
  }))

  return (
    <section id="ratings" className="stats-chart-section">
      <h3 className="stats-chart-section__title">{t('stats.ratings')}</h3>
      {avgRating != null && (
        <p className="stats-chart-section__subtitle">
          {t('stats.avgRating')}: {avgRating} ★
        </p>
      )}
      <div className="stats-chart-container" style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ left: 0, right: 20, top: 0, bottom: 0 }}>
            <XAxis dataKey="name" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" name={t('stats.books')} fill="var(--color-brand, #C4704B)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
