import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import type { PaceStatDto } from '../../api/readingTracking'
import { useTranslation } from '../../hooks/useTranslation'

interface Props {
  data: PaceStatDto[]
}

const COLORS: Record<string, string> = {
  slow: '#4B0082',
  medium: '#FF1493',
  fast: '#FF8C00',
}

export function PaceChart({ data }: Props) {
  const { t } = useTranslation()
  const chartData = data.map(d => ({
    name: t(`stats.${d.pace}`),
    value: d.count,
    pace: d.pace,
  }))

  return (
    <section id="pace" className="stats-chart-section">
      <h3 className="stats-chart-section__title">{t('stats.pace')}</h3>
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
                {chartData.map((d) => (
                  <Cell key={d.pace} fill={COLORS[d.pace] || '#999'} />
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
