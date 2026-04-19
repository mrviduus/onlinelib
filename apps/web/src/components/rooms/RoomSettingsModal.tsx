import { useState } from 'react'
import { useRoom } from '../../context/RoomContext'
import { useTranslation } from '../../hooks/useTranslation'

interface Props {
  isOwner: boolean
  onClose: () => void
}

export function RoomSettingsModal({ isOwner, onClose }: Props) {
  const { room, members, toggleMyProgress, leaveRoom, closeRoom } = useRoom()
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // We can't know `userId` directly here — derive from members whose role === 'Owner' if I'm owner,
  // otherwise we accept toggleMyProgress sends heartbeat with showProgress=value (server applies to caller).
  // Current showProgress: best-effort — we use false as default until heartbeat roundtrip.
  const myMember = isOwner
    ? members.find(m => m.role === 'Owner')
    : undefined
  const [showProgress, setShowProgress] = useState<boolean>(myMember?.showProgress ?? false)

  if (!room) return null

  const runLeave = async () => {
    setBusy(true); setError(null)
    try { await leaveRoom(); onClose() }
    catch (e) { setError(e instanceof Error ? e.message : 'failed'); setBusy(false) }
  }

  const runClose = async () => {
    setBusy(true); setError(null)
    try { await closeRoom(); onClose() }
    catch (e) { setError(e instanceof Error ? e.message : 'failed'); setBusy(false) }
  }

  const runToggle = async (val: boolean) => {
    setShowProgress(val)
    try { await toggleMyProgress(val) }
    catch (e) { setError(e instanceof Error ? e.message : 'failed'); setShowProgress(!val) }
  }

  return (
    <div className="room-modal__overlay" onClick={onClose}>
      <div className="room-modal" onClick={e => e.stopPropagation()}>
        <button className="room-modal__close" onClick={onClose} aria-label="close">&times;</button>
        <h2>{t('rooms.settingsTitle')}</h2>

        <label className="room-modal__toggle">
          <input
            type="checkbox"
            checked={showProgress}
            onChange={e => runToggle(e.target.checked)}
            disabled={busy}
          />
          <span>{t('rooms.showMyProgress')}</span>
        </label>
        <p className="room-modal__hint">{t('rooms.showMyProgressHint')}</p>

        {error && <div className="room-modal__error">{error}</div>}

        <div className="room-modal__actions">
          {isOwner ? (
            <button className="room-modal__danger" onClick={runClose} disabled={busy}>
              {t('rooms.closeRoom')}
            </button>
          ) : (
            <button className="room-modal__danger" onClick={runLeave} disabled={busy}>
              {t('rooms.leaveRoom')}
            </button>
          )}
        </div>

        <style>{css}</style>
      </div>
    </div>
  )
}

const css = `
.room-modal__toggle {
  display: flex; align-items: center; gap: 8px;
  font-size: 14px; margin-top: 8px; color: var(--text, #222);
}
.room-modal__hint { font-size: 12px; color: var(--muted, #666); margin: 4px 0 16px; }
.room-modal__actions { margin-top: 20px; }
.room-modal__danger {
  width: 100%; padding: 10px; background: transparent; color: #dc2626;
  border: 1px solid #dc2626; border-radius: 6px; cursor: pointer; font-size: 14px;
}
.room-modal__danger:hover:not(:disabled) { background: #dc2626; color: #fff; }
.room-modal__danger:disabled { opacity: 0.6; cursor: default; }
`
