import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../../context/LanguageContext'
import { useTranslation } from '../../hooks/useTranslation'

interface MenuItem {
  key: string
  icon: string
  label: string
  shortcut?: string
  comingSoon?: boolean
  onSelect?: () => void
  divider?: false
}

interface Divider { key: string; divider: true }
type MenuEntry = MenuItem | Divider

interface Props {
  onUpload: () => void
  triggerLabel: string
  triggerTitle: string
  triggerClassName?: string
}

export function AddMenu({ onUpload, triggerLabel, triggerTitle, triggerClassName }: Props) {
  const { t } = useTranslation()
  const { getLocalizedPath } = useLanguage()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close()
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  const handle = (cb?: () => void) => () => {
    close()
    cb?.()
  }

  const entries: MenuEntry[] = [
    {
      key: 'upload',
      icon: 'upload_file',
      label: t('addMenu.uploadFile'),
      shortcut: t('addMenu.uploadShortcut'),
      onSelect: onUpload,
    },
    { key: 'url', icon: 'link', label: t('addMenu.pasteUrl'), comingSoon: true },
    { key: 'email', icon: 'mail_outline', label: t('addMenu.emailBook'), comingSoon: true },
    { key: 'd1', divider: true },
    {
      key: 'extension',
      icon: 'extension',
      label: t('addMenu.browserExtension'),
      onSelect: () => window.open('https://chromewebstore.google.com', '_blank', 'noopener,noreferrer'),
    },
    {
      key: 'mobile',
      icon: 'phone_iphone',
      label: t('addMenu.mobileApps'),
      onSelect: () => navigate(getLocalizedPath('/')),
    },
    { key: 'd2', divider: true },
    {
      key: 'browse',
      icon: 'menu_book',
      label: t('addMenu.browseAll'),
      onSelect: () => navigate(getLocalizedPath('/books')),
    },
  ]

  return (
    <div className="add-menu" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName ?? 'site-header__upload-btn'}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerLabel}
        title={triggerTitle}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="material-icons-outlined">add</span>
        <span className="site-header__upload-btn-label">{triggerLabel}</span>
      </button>
      {open && (
        <ul className="add-menu__list" role="menu" aria-label={t('addMenu.ariaLabel')}>
          {entries.map((e) => {
            if ('divider' in e) return <li key={e.key} className="add-menu__divider" role="separator" />
            const disabled = !!e.comingSoon
            return (
              <li key={e.key} role="none">
                <button
                  type="button"
                  role="menuitem"
                  className={`add-menu__item ${disabled ? 'add-menu__item--disabled' : ''}`}
                  disabled={disabled}
                  title={disabled ? t('addMenu.comingSoon') : undefined}
                  onClick={handle(e.onSelect)}
                >
                  <span className="material-icons-outlined add-menu__icon">{e.icon}</span>
                  <span className="add-menu__label">{e.label}</span>
                  {e.shortcut && <kbd className="add-menu__shortcut">{e.shortcut}</kbd>}
                  {disabled && <span className="add-menu__badge">{t('addMenu.comingSoon')}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
