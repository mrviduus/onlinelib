import { useState, FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
import { useTranslation } from '../../hooks/useTranslation'

/** The exact phrase the user must type to arm the destructive confirm button. */
export const DELETE_CONFIRM_PHRASE = 'DELETE'

/** Pure gate: confirm is enabled only when the typed phrase matches exactly (trimmed). */
export function isDeleteConfirmed(input: string): boolean {
  return input.trim() === DELETE_CONFIRM_PHRASE
}

export function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const { deleteAccount } = useAuth()
  const { getLocalizedPath } = useLanguage()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [confirmText, setConfirmText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const armed = isDeleteConfirmed(confirmText)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!armed || loading) return
    setError('')
    setLoading(true)
    try {
      await deleteAccount()
      // Session cleared by deleteAccount() — leave to home.
      navigate(getLocalizedPath('/'), { replace: true })
    } catch (err: any) {
      setError(err?.message || t('deleteAccount.error'))
      setLoading(false)
    }
  }

  return createPortal(
    <div className="profile-overlay" onClick={loading ? undefined : onClose}>
      <div
        className="profile-modal profile-modal--danger"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
      >
        {!loading && (
          <button className="profile-modal__close" onClick={onClose} aria-label={t('deleteAccount.cancel')}>
            &times;
          </button>
        )}
        <div className="profile-modal__body">
          <h2 className="profile-modal__title" id="delete-account-title">
            {t('deleteAccount.title')}
          </h2>
          <form onSubmit={handleSubmit}>
            <p className="profile-modal__danger-warning">{t('deleteAccount.warning')}</p>
            <label className="profile-modal__label" htmlFor="delete-account-confirm">
              {t('deleteAccount.confirmLabel', { phrase: DELETE_CONFIRM_PHRASE })}
            </label>
            <input
              id="delete-account-confirm"
              type="text"
              className="profile-modal__input"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder={DELETE_CONFIRM_PHRASE}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              disabled={loading}
            />
            {error && <p className="profile-modal__error">{error}</p>}
            <div className="profile-modal__danger-actions">
              <button
                type="button"
                className="profile-modal__btn profile-modal__btn--secondary"
                onClick={onClose}
                disabled={loading}
              >
                {t('deleteAccount.cancel')}
              </button>
              <button
                type="submit"
                className="profile-modal__btn profile-modal__btn--danger"
                disabled={!armed || loading}
              >
                {loading ? t('deleteAccount.deleting') : t('deleteAccount.confirm')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body,
  )
}
