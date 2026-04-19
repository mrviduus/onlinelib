import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useRoom } from '../../context/RoomContext'
import { useLanguage } from '../../context/LanguageContext'
import { useTranslation } from '../../hooks/useTranslation'

interface Props {
  editionId: string
  bookSlug: string
  firstChapterSlug: string
  className?: string
}

export function StartRoomButton({ editionId, bookSlug, firstChapterSlug, className }: Props) {
  const { isAuthenticated, openAuthModal } = useAuth()
  const { createRoom } = useRoom()
  const { language } = useLanguage()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const handleClick = async () => {
    if (!isAuthenticated) { openAuthModal(); return }
    setBusy(true); setErr(null)
    try {
      const roomId = await createRoom('Edition', editionId)
      navigate(`/${language}/books/${bookSlug}/${firstChapterSlug}?room=${roomId}&openInvite=1`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className={className ?? 'book-hero__read-btn'}
        onClick={handleClick}
        disabled={busy}
      >
        {busy ? t('rooms.joining') : t('rooms.readTogether')}
      </button>
      {err && <span style={{ color: '#dc2626', fontSize: 12 }}>{err}</span>}
    </>
  )
}
