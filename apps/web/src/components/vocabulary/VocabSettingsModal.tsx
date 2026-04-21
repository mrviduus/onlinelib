import { FormEvent, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from '../../hooks/useTranslation'
import {
  getVocabSettings,
  updateVocabSettings,
  type VocabSettingsDto,
} from '../../api/vocabulary'

interface Props {
  onClose: () => void
  onSaved?: () => void
}

const DAILY_CAP_MIN = 5
const DAILY_CAP_MAX = 100
const WEEKLY_BUDGET_MIN = 10
const WEEKLY_BUDGET_MAX = 500

export function VocabSettingsModal({ onClose, onSaved }: Props) {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<VocabSettingsDto | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    getVocabSettings()
      .then(s => { if (mounted) setSettings(s) })
      .catch(() => { if (mounted) setError(t('vocabulary.settings.loadFailed')) })
    return () => { mounted = false }
  }, [t])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const clamp = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, Number.isFinite(v) ? v : min))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!settings) return
    setSaving(true)
    setError(null)
    try {
      const payload: VocabSettingsDto = {
        ...settings,
        dailyNewCap: clamp(settings.dailyNewCap, DAILY_CAP_MIN, DAILY_CAP_MAX),
        weeklyReviewBudget: clamp(settings.weeklyReviewBudget, WEEKLY_BUDGET_MIN, WEEKLY_BUDGET_MAX),
      }
      const saved = await updateVocabSettings(payload)
      setSettings(saved)
      onSaved?.()
      onClose()
    } catch {
      setError(t('vocabulary.settings.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const patch = (p: Partial<VocabSettingsDto>) => {
    setSettings(prev => prev ? { ...prev, ...p } : prev)
  }

  return createPortal(
    <div className="vocab-settings-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={t('vocabulary.settings.title')}>
      <div className="vocab-settings-modal" onClick={e => e.stopPropagation()}>
        <button type="button" className="vocab-settings-modal__close" onClick={onClose} aria-label={t('common.close')}>×</button>
        <h2 className="vocab-settings-modal__title">{t('vocabulary.settings.title')}</h2>
        <p className="vocab-settings-modal__subtitle">{t('vocabulary.settings.subtitle')}</p>

        {settings === null && !error ? (
          <div className="vocab-loading">{t('common.loading')}</div>
        ) : (
          <form onSubmit={handleSubmit} className="vocab-settings-form">
            {error && <div className="vocab-settings-form__error" role="alert">{error}</div>}

            <label className="vocab-settings-field">
              <span className="vocab-settings-field__label">{t('vocabulary.settings.dailyNewCap')}</span>
              <span className="vocab-settings-field__hint">{t('vocabulary.settings.dailyNewCapHint')}</span>
              <input
                type="number"
                min={DAILY_CAP_MIN}
                max={DAILY_CAP_MAX}
                value={settings?.dailyNewCap ?? ''}
                onChange={e => patch({ dailyNewCap: parseInt(e.target.value, 10) || DAILY_CAP_MIN })}
                className="vocab-settings-field__input"
              />
            </label>

            <label className="vocab-settings-field">
              <span className="vocab-settings-field__label">{t('vocabulary.settings.weeklyBudget')}</span>
              <span className="vocab-settings-field__hint">{t('vocabulary.settings.weeklyBudgetHint')}</span>
              <input
                type="number"
                min={WEEKLY_BUDGET_MIN}
                max={WEEKLY_BUDGET_MAX}
                value={settings?.weeklyReviewBudget ?? ''}
                onChange={e => patch({ weeklyReviewBudget: parseInt(e.target.value, 10) || WEEKLY_BUDGET_MIN })}
                className="vocab-settings-field__input"
              />
            </label>

            <label className="vocab-settings-field vocab-settings-field--toggle">
              <span className="vocab-settings-field__head">
                <span className="vocab-settings-field__label">{t('vocabulary.settings.frequencyFilter')}</span>
                <input
                  type="checkbox"
                  checked={!!settings?.frequencyFilterEnabled}
                  onChange={e => patch({ frequencyFilterEnabled: e.target.checked })}
                />
              </span>
              <span className="vocab-settings-field__hint">{t('vocabulary.settings.frequencyFilterHint')}</span>
            </label>

            <label className="vocab-settings-field vocab-settings-field--toggle">
              <span className="vocab-settings-field__head">
                <span className="vocab-settings-field__label">{t('vocabulary.settings.autoRetire')}</span>
                <input
                  type="checkbox"
                  checked={!!settings?.autoRetireEnabled}
                  onChange={e => patch({ autoRetireEnabled: e.target.checked })}
                />
              </span>
              <span className="vocab-settings-field__hint">{t('vocabulary.settings.autoRetireHint')}</span>
            </label>

            <div className="vocab-settings-form__actions">
              <button
                type="button"
                className="vocab-settings-form__cancel"
                onClick={onClose}
                disabled={saving}
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                className="vocab-settings-form__save"
                disabled={saving || !settings}
              >
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  )
}
