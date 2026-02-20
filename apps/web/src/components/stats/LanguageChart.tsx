import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import type { LanguageStatDto } from '../../api/readingTracking'
import { useTranslation } from '../../hooks/useTranslation'

interface Props {
  data: LanguageStatDto[]
}

const LANG_NAMES: Record<string, string> = {
  en: 'English',
  uk: 'Ukrainian',
}

const COLORS = ['#C4704B', '#8b4513', '#d4a574', '#a0522d', '#cd853f']

export function LanguageChart({ data }: Props) {
  const { t } = useTranslation()
  if (data.length === 0) return null

  const chartData = data.map(d => ({
    name: LANG_NAMES[d.language] || d.language.toUpperCase(),
    value: d.count,
  }))

  return (
    <section id="languages" className="stats-chart-section">
      <h3 className="stats-chart-section__title">{t('stats.languages')}</h3>
      <div className="stats-chart-container" style={{ height: 250 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} (${Math.round((percent ?? 0) * 100)}%)`}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
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
