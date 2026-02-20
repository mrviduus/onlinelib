import { useTranslation } from '../../hooks/useTranslation'

interface TimePeriodFilterProps {
  year: number | undefined
  setYear: (year: number | undefined) => void
  availableYears: number[]
}

export function TimePeriodFilter({ year, setYear, availableYears }: TimePeriodFilterProps) {
  const { t } = useTranslation()

  return (
    <select
      className="stats-filter__select"
      value={year ?? ''}
      onChange={(e) => setYear(e.target.value ? Number(e.target.value) : undefined)}
    >
      <option value="">{t('stats.allTime')}</option>
      {availableYears.map((y) => (
        <option key={y} value={y}>{y}</option>
      ))}
    </select>
  )
}
