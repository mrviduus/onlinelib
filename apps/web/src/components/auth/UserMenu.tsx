import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { LocalizedLink } from '../LocalizedLink'
import { ProfileModal } from './ProfileModal'
import { getLanguage, getFlagUrl } from '../../data/languages'

export function UserMenu() {
  const { user, logout } = useAuth()
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

  const initials = user.name
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
            <span className="user-menu__avatar">{initials}</span>
          )}
        </button>

        {open && (
          <div className="user-menu__dropdown">
            <div className="user-menu__info">
              <span className="user-menu__name">{user.name || 'User'}</span>
              <span className="user-menu__email">{user.email}</span>
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
