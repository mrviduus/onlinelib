import { useState } from 'react'
import { useRoom } from '../../context/RoomContext'
import { useTranslation } from '../../hooks/useTranslation'

interface Props { onClose: () => void }

const EXPIRY_OPTIONS = [
  { label: '1h', seconds: 3600 },
  { label: '24h', seconds: 86400 },
  { label: '7d', seconds: 604800 },
  { label: '30d', seconds: 2592000 },
]

export function RoomInviteModal({ onClose }: Props) {
  const { roomId, createInvite } = useRoom()
  const { t } = useTranslation()
  const [expiresInSeconds, setExpiresInSeconds] = useState(86400)
  const [maxUses, setMaxUses] = useState<number | ''>('')
  const [link, setLink] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  if (!roomId) return null

  const handleGenerate = async () => {
    setLoading(true)
    setError(null)
    try {
      const opts: { expiresInSeconds?: number; maxUses?: number } = { expiresInSeconds }
      if (typeof maxUses === 'number' && maxUses > 0) opts.maxUses = maxUses
      const inv = await createInvite(opts)
      const url = `${window.location.origin}/rooms/join/${inv.token}`
      setLink(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* no-op */ }
  }

  return (
    <div className="room-modal__overlay" onClick={onClose}>
      <div className="room-modal" onClick={e => e.stopPropagation()}>
        <button className="room-modal__close" onClick={onClose} aria-label="close">&times;</button>
        <h2>{t('rooms.inviteTitle')}</h2>

        <label className="room-modal__label">
          {t('rooms.expiresIn')}
          <select
            value={expiresInSeconds}
            onChange={e => setExpiresInSeconds(Number(e.target.value))}
          >
            {EXPIRY_OPTIONS.map(o => (
              <option key={o.seconds} value={o.seconds}>{o.label}</option>
            ))}
          </select>
        </label>

        <label className="room-modal__label">
          {t('rooms.maxUses')}
          <input
            type="number"
            min={1}
            placeholder={t('rooms.maxUsesPlaceholder')}
            value={maxUses}
            onChange={e => setMaxUses(e.target.value === '' ? '' : Number(e.target.value))}
          />
        </label>

        <button
          className="room-modal__primary"
          onClick={handleGenerate}
          disabled={loading}
        >
          {loading ? t('rooms.generating') : t('rooms.generateLink')}
        </button>

        {error && <div className="room-modal__error">{error}</div>}

        {link && (
          <div className="room-modal__result">
            <input className="room-modal__link" readOnly value={link} onFocus={e => e.currentTarget.select()} />
            <button className="room-modal__copy" onClick={handleCopy}>
              {copied ? t('rooms.copied') : t('rooms.copy')}
            </button>
          </div>
        )}

        <style>{css}</style>
      </div>
    </div>
  )
}

const css = `
.room-modal__overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.45);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.room-modal {
  background: var(--bg, #fff); border-radius: 12px; padding: 24px;
  width: min(420px, 92vw); max-height: 90vh; overflow:auto;
  position: relative; box-shadow: 0 10px 40px rgba(0,0,0,0.25);
  color: var(--text, #222);
}
.room-modal__close {
  position: absolute; top: 8px; right: 12px;
  background: none; border: none; font-size: 24px; cursor: pointer;
  color: var(--text, #222);
}
.room-modal h2 { margin: 0 0 16px; font-size: 18px; }
.room-modal__label {
  display: flex; flex-direction: column; gap: 4px;
  font-size: 13px; margin-bottom: 12px; color: var(--muted, #666);
}
.room-modal__label select, .room-modal__label input {
  padding: 8px 10px; border: 1px solid var(--border, #ddd);
  border-radius: 6px; font-size: 14px; background: var(--input-bg, #fff); color: inherit;
}
.room-modal__primary {
  width: 100%; padding: 10px; background: #2563eb; color: #fff;
  border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;
}
.room-modal__primary:disabled { opacity: 0.6; cursor: default; }
.room-modal__error { margin-top: 12px; color: #dc2626; font-size: 13px; }
.room-modal__result { display: flex; gap: 8px; margin-top: 16px; }
.room-modal__link {
  flex: 1; padding: 8px 10px; border: 1px solid var(--border, #ddd);
  border-radius: 6px; font-size: 12px; font-family: monospace;
  background: var(--input-bg, #f5f5f5); color: inherit;
}
.room-modal__copy {
  padding: 8px 14px; border: 1px solid var(--border, #ddd); border-radius: 6px;
  background: var(--bg, #fff); cursor: pointer; font-size: 13px; color: inherit;
}
`
