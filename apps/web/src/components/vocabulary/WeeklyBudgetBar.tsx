import type { WeeklyProgressDto } from '@textstack/shared'
import { useTranslation } from '../../hooks/useTranslation'

interface Props {
  progress: WeeklyProgressDto
}

export function WeeklyBudgetBar({ progress }: Props) {
  const { t } = useTranslation()
  const pct = progress.budget > 0
    ? Math.min(100, Math.round((progress.used / progress.budget) * 100))
    : 0
  const reached = progress.remaining <= 0

  return (
    <div className={`vocab-weekly-budget${reached ? ' vocab-weekly-budget--reached' : ''}`}>
      <div className="vocab-weekly-budget__header">
        <span className="vocab-weekly-budget__label">{t('vocabulary.weeklyBudget.label')}</span>
        <span className="vocab-weekly-budget__progress">
          {t('vocabulary.weeklyBudget.progress')
            .replace('{used}', String(progress.used))
            .replace('{budget}', String(progress.budget))}
        </span>
      </div>
      <div className="vocab-weekly-budget__track" aria-hidden>
        <div className="vocab-weekly-budget__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
