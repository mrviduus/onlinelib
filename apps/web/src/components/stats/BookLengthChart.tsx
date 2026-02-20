import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import type { BookLengthBucketDto } from '../../api/readingTracking'
import { useTranslation } from '../../hooks/useTranslation'

interface Props {
  data: BookLengthBucketDto[]
}

const BUCKET_COLORS: Record<string, string> = {
  short: '#d4a574',
  medium: '#C4704B',
  long: '#8b4513',
}

export function BookLengthChart({ data }: Props) {
  const { t } = useTranslation()
  if (data.length === 0) return null

  const chartData = data.map(d => ({
    name: t(`stats.${d.bucket}`),
    value: d.count,
    bucket: d.bucket,
  }))

  return (
    <section id="book-length" className="stats-chart-section">
      <h3 className="stats-chart-section__title">{t('stats.bookLength')}</h3>
      <div className="stats-chart-container" style={{ height: 250 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} (${Math.round((percent ?? 0) * 100)}%)`}>
              {chartData.map((d) => (
                <Cell key={d.bucket} fill={BUCKET_COLORS[d.bucket] || '#999'} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
