import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import type { BookLengthBucketDto } from '../../api/readingTracking'
import { useTranslation } from '../../hooks/useTranslation'
import { CATEGORICAL_COLORS } from './chartColors'

interface Props {
  data: BookLengthBucketDto[]
}

export function BookLengthChart({ data }: Props) {
  const { t } = useTranslation()
  const chartData = data.map(d => ({
    name: t(`stats.${d.bucket}`),
    value: d.count,
    bucket: d.bucket,
  }))

  return (
    <section id="book-length" className="stats-chart-section">
      <h3 className="stats-chart-section__title">{t('stats.bookLength')}</h3>
      <div className="stats-chart-container" style={{ height: 250 }}>
        {data.length === 0 ? (
          <div className="stats-chart-empty-pie">
            <svg viewBox="0 0 200 200" width="160" height="160">
              <circle cx="100" cy="100" r="80" fill="none" stroke="var(--color-border, #e5e7eb)" strokeWidth="2" />
            </svg>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} (${Math.round((percent ?? 0) * 100)}%)`}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  )
}
