import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { RatingBucketDto } from '../../api/readingTracking'
import { useTranslation } from '../../hooks/useTranslation'
import { UNIFORM_BLUE } from './chartColors'

interface Props {
  data: RatingBucketDto[]
  avgRating: number | null
}

function ratingLabel(r: number): string {
  if (r % 1 === 0) return '★'.repeat(r)
  return '★'.repeat(Math.floor(r)) + '½'
}

export function RatingChart({ data, avgRating }: Props) {
  const { t } = useTranslation()
  const chartData = data.map(d => ({
    name: ratingLabel(d.rating),
    count: d.count,
  }))

  return (
    <section id="ratings" className="stats-chart-section">
      <h3 className="stats-chart-section__title">{t('stats.ratings')}</h3>
      <p className="stats-chart-section__subtitle">
        {data.length === 0 ? '0 reviews' : `${avgRating != null ? `${t('stats.avgRating')}: ${avgRating} ★` : ''}`}
      </p>
      {data.length === 0 ? (
        <p className="stats-chart-section__hint">{t('stats.noData')}</p>
      ) : (
        <div className="stats-chart-container" style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ left: 0, right: 20, top: 0, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" name={t('stats.books')} fill={UNIFORM_BLUE} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}
