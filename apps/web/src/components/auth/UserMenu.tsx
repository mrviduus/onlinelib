import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { LocalizedLink } from '../LocalizedLink'
import { ProfileModal } from './ProfileModal'
import { getLanguage, getFlagUrl } from '../../data/languages'
import { useTranslation } from '../../hooks/useTranslation'
import { useOnline } from '../../hooks/useOnline'
import { getAnonymousReaderName, getAnonymousReaderColor } from '@textstack/shared'

export function UserMenu() {
  const { user, logout } = useAuth()
  const { t } = useTranslation()
  const online = useOnline()
  const [open, setOpen] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }

    if (open) {
      document.addEventListener('click', handleClick)
      return () => document.removeEventListener('click', handleClick)
    }
  }, [open])

  if (!user) return null

  const isGuest = !!user.isGuest
  const displayName = isGuest ? getAnonymousReaderName(user.id) : (user.name || 'User')
  const displaySubtitle = isGuest ? t('userMenu.anonymousReader') : user.email
  const initials = isGuest
    ? displayName.split(' ').map(n => n[0]).join('').toUpperCase()
    : user.name
      ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
      : user.email[0].toUpperCase()

  const avatarSrc = user.picture?.startsWith('http')
    ? user.picture
    : user.picture ? `/storage/${user.picture}` : null

  const nativeLang = user.nativeLanguage ? getLanguage(user.nativeLanguage) : null

  return (
    <>
      <div className="user-menu" ref={menuRef}>
        <button
          className="user-menu__trigger"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-haspopup="true"
        >
          {avatarSrc ? (
            <img src={avatarSrc} alt="" className="user-menu__avatar-img" referrerPolicy="no-referrer" />
          ) : (
            <span
              className="user-menu__avatar"
              style={isGuest ? { backgroundColor: getAnonymousReaderColor(user.id), color: '#fff' } : undefined}
            >{initials}</span>
          )}
          <span
            className={`user-menu__status-dot${online ? ' user-menu__status-dot--online' : ''}`}
            title={online ? 'Online' : 'Offline'}
            aria-label={online ? 'Online' : 'Offline'}
          />
        </button>

        {open && (
          <div className="user-menu__dropdown">
            <div className="user-menu__info">
              <span className="user-menu__name">{displayName}</span>
              <span className="user-menu__email">{displaySubtitle}</span>
            </div>
            <hr className="user-menu__divider" />
            <button
              className="user-menu__item user-menu__item--lang"
              onClick={() => { setOpen(false); setShowProfile(true) }}
              title="Change your native language — used for translations in the reader"
            >
              <span className="user-menu__item-label">My language</span>
              <span className="user-menu__item-value">
                {nativeLang ? (
                  <>
                    <img
                      src={getFlagUrl(nativeLang.code)}
                      alt=""
                      width="16"
                      height="12"
                      className="user-menu__flag"
                    />
                    {nativeLang.englishName}
                  </>
                ) : (
                  <span className="user-menu__item-placeholder">Set language</span>
                )}
              </span>
            </button>
            <button
              className="user-menu__item"
              onClick={() => { setOpen(false); setShowProfile(true) }}
            >
              Edit profile
            </button>
            <LocalizedLink
              to="/library"
              className="user-menu__item"
              onClick={() => setOpen(false)}
            >
              My Library
            </LocalizedLink>
            <LocalizedLink
              to="/highlights"
              className="user-menu__item"
              onClick={() => setOpen(false)}
            >
              Highlights
            </LocalizedLink>
            <LocalizedLink
              to="/vocabulary"
              className="user-menu__item"
              onClick={() => setOpen(false)}
            >
              Vocabulary
            </LocalizedLink>
            <hr className="user-menu__divider" />
            <button
              className="user-menu__item user-menu__item--danger"
              onClick={() => {
                setOpen(false)
                logout()
              }}
            >
              Sign out
            </button>
          </div>
        )}
      </div>
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </>
  )
}
