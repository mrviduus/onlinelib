import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { GenreStatDto } from '../../api/readingTracking'
import { useTranslation } from '../../hooks/useTranslation'
import { CATEGORICAL_COLORS } from './chartColors'

interface GenreChartProps {
  data: GenreStatDto[]
}

export function GenreChart({ data }: GenreChartProps) {
  const { t } = useTranslation()
  return (
    <section id="genres" className="stats-chart-section">
      <h3 className="stats-chart-section__title">{t('stats.genres')}</h3>
      {data.length === 0 ? (
        <p className="stats-chart-section__hint">{t('stats.noData')}</p>
      ) : (
      <div className="stats-chart-container" style={{ height: Math.max(200, data.length * 32) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 0, right: 20, top: 0, bottom: 0 }}>
            <XAxis type="number" allowDecimals={false} />
            <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 13 }} />
            <Tooltip />
            <Bar dataKey="count" name={t('stats.books')} radius={[0, 4, 4, 0]}>
              {data.map((_, i) => (
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
