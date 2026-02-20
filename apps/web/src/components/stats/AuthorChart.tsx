import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { AuthorStatDto } from '../../api/readingTracking'
import { useTranslation } from '../../hooks/useTranslation'

interface AuthorChartProps {
  data: AuthorStatDto[]
}

export function AuthorChart({ data }: AuthorChartProps) {
  const { t } = useTranslation()
  if (data.length === 0) return null

  return (
    <section id="authors" className="stats-chart-section">
      <h3 className="stats-chart-section__title">{t('stats.authors')}</h3>
      <div className="stats-chart-container" style={{ height: Math.max(200, data.length * 32) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 0, right: 20, top: 0, bottom: 0 }}>
            <XAxis type="number" allowDecimals={false} />
            <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 13 }} />
            <Tooltip />
            <Bar dataKey="count" name={t('stats.books')} fill="#8b4513" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
