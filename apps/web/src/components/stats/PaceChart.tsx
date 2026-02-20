import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import type { PaceStatDto } from '../../api/readingTracking'
import { useTranslation } from '../../hooks/useTranslation'

interface Props {
  data: PaceStatDto[]
}

const COLORS: Record<string, string> = {
  slow: '#d4a574',
  medium: '#C4704B',
  fast: '#8b4513',
}

export function PaceChart({ data }: Props) {
  const { t } = useTranslation()
  if (data.length === 0) return null

  const chartData = data.map(d => ({
    name: t(`stats.${d.pace}`),
    value: d.count,
    pace: d.pace,
  }))

  return (
    <section id="pace" className="stats-chart-section">
      <h3 className="stats-chart-section__title">{t('stats.pace')}</h3>
      <div className="stats-chart-container" style={{ height: 250 }}>
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
      </div>
    </section>
  )
}
