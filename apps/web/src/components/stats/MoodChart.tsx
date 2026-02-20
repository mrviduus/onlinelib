import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { MoodStatDto } from '../../api/readingTracking'
import { useTranslation } from '../../hooks/useTranslation'
import { CATEGORICAL_COLORS } from './chartColors'

interface Props {
  data: MoodStatDto[]
}

export function MoodChart({ data }: Props) {
  const { t } = useTranslation()
  const chartData = data.map(d => ({
    name: d.name,
    count: d.count,
  }))

  return (
    <section id="moods" className="stats-chart-section">
      <h3 className="stats-chart-section__title">{t('stats.moods')}</h3>
      {data.length === 0 ? (
        <p className="stats-chart-section__hint">{t('stats.noData')}</p>
      ) : (
        <div className="stats-chart-container" style={{ height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ left: 0, right: 20, top: 0, bottom: 60 }}>
              <XAxis dataKey="name" interval={0} height={80} angle={-45} textAnchor="end" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" name={t('stats.books')} radius={[4, 4, 0, 0]}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}
