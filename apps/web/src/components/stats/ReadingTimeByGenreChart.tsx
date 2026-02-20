import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { ReadingTimeStatDto } from '../../api/readingTracking'
import { useTranslation } from '../../hooks/useTranslation'

interface Props {
  data: ReadingTimeStatDto[]
}

function formatHours(seconds: number): string {
  const h = Math.round(seconds / 3600 * 10) / 10
  return `${h}h`
}

export function ReadingTimeByGenreChart({ data }: Props) {
  const { t } = useTranslation()
  if (data.length === 0) return null

  const chartData = data.map(d => ({ ...d, hours: Math.round(d.seconds / 3600 * 10) / 10 }))

  return (
    <section className="stats-chart-section">
      <h3 className="stats-chart-section__title">{t('stats.readingTimeByGenre')}</h3>
      <div className="stats-chart-container" style={{ height: Math.max(200, data.length * 32) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 20, top: 0, bottom: 0 }}>
            <XAxis type="number" tickFormatter={v => `${v}h`} />
            <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 13 }} />
            <Tooltip formatter={(v) => formatHours(Number(v) * 3600)} />
            <Bar dataKey="hours" name={t('stats.hours')} fill="var(--color-brand, #C4704B)" opacity={0.7} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
