import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useRoom } from '../context/RoomContext'
import { useLanguage } from '../context/LanguageContext'
import { useTranslation } from '../hooks/useTranslation'
import { getRoom } from '../api/rooms'

export function RoomJoinPage() {
  const { token } = useParams<{ token: string }>()
  const { user, openAuthModal } = useAuth()
  const { joinRoom } = useRoom()
  const { language } = useLanguage()
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [status, setStatus] = useState<'idle' | 'joining' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const attemptedRef = useRef(false)

  useEffect(() => {
    if (!token) return
    if (!user) {
      openAuthModal()
      return
    }
    if (attemptedRef.current) return
    attemptedRef.current = true

    ;(async () => {
      setStatus('joining')
      try {
        const roomId = await joinRoom(token)
        const room = await getRoom(roomId)
        if (
          room.targetType === 'Edition' &&
          room.bookSlug &&
          room.bookLanguage &&
          room.firstChapterSlug
        ) {
          navigate(
            `/${room.bookLanguage}/books/${room.bookSlug}/${room.firstChapterSlug}?room=${roomId}`,
            { replace: true }
          )
        } else {
          navigate(`/${language}/library?room=${roomId}`, { replace: true })
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'join failed')
        setStatus('error')
      }
    })()
  }, [token, user, openAuthModal, joinRoom, navigate, language])

  return (
    <div style={{ maxWidth: 480, margin: '64px auto', padding: 24, textAlign: 'center' }}>
      <h1 style={{ fontSize: 20, marginBottom: 12 }}>{t('rooms.joinTitle')}</h1>
      {!user && <p>{t('rooms.joinNeedLogin')}</p>}
      {status === 'joining' && <p>{t('rooms.joining')}</p>}
      {status === 'error' && (
        <>
          <p style={{ color: '#dc2626' }}>{error ?? t('rooms.joinFailed')}</p>
          <button onClick={() => navigate(`/${language}`)}>{t('common.home')}</button>
        </>
      )}
    </div>
  )
}
