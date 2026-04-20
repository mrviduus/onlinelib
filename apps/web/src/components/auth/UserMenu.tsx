import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { LocalizedLink } from '../LocalizedLink'
import { ProfileModal } from './ProfileModal'
import { getLanguage, getFlagUrl } from '../../data/languages'
import { useTranslation } from '../../hooks/useTranslation'
import { useOnline } from '../../hooks/useOnline'
import { getAnonymousReader } from '@textstack/shared'
import { getUserInitials } from '../../lib/userInitials'

export function UserMenu() {
  const { user, logout } = useAuth()
  const { t } = useTranslation()
  const online = useOnline()
  const [open, setOpen] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [anonImgFailed, setAnonImgFailed] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setAnonImgFailed(false) }, [user?.id])

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
  const anon = isGuest ? getAnonymousReader(user.id) : null
  const displayName = anon ? anon.name : (user.name || 'User')
  const displaySubtitle = anon ? t('userMenu.anonymousReader') : user.email
  const tooltip = anon ? `${displayName} · ${t('userMenu.anonymousReader')}` : displayName
  const initials = getUserInitials(user)

  const avatarSrc = user.picture?.startsWith('http')
    ? user.picture
    : user.picture ? `/storage/${user.picture}` : null

  const showAnimal = !avatarSrc && !!anon?.avatarPath && !anonImgFailed
  const nativeLang = user.nativeLanguage ? getLanguage(user.nativeLanguage) : null

  return (
    <>
      <div className="user-menu" ref={menuRef}>
        <button
          className="user-menu__trigger"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-haspopup="true"
          title={tooltip}
          aria-label={tooltip}
          style={anon ? { backgroundColor: anon.color } : undefined}
        >
          {avatarSrc ? (
            <img src={avatarSrc} alt="" className="user-menu__avatar-img" referrerPolicy="no-referrer" />
          ) : showAnimal ? (
            <img
              src={anon!.avatarPath!}
              alt=""
              className="user-menu__avatar-anon"
              onError={() => setAnonImgFailed(true)}
            />
          ) : (
            <span className="user-menu__avatar">{initials}</span>
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
