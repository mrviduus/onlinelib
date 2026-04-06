import { useState, useRef, useEffect } from 'react'
import { useLanguage, SupportedLanguage } from '../context/LanguageContext'
import { useNativeLanguage, NATIVE_LANGUAGES } from '../context/NativeLanguageContext'

const TARGET_LANGUAGES = NATIVE_LANGUAGES.filter((l) => l.code === 'en' || l.code === 'uk')

export function LanguageSwitcher() {
  const { language, switchLanguage } = useLanguage()
  const { nativeLanguage, setNativeLanguage } = useNativeLanguage()
  const [openMenu, setOpenMenu] = useState<'native' | 'target' | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpenMenu(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const nativeLang = NATIVE_LANGUAGES.find((l) => l.code === nativeLanguage) || NATIVE_LANGUAGES[1]
  const targetLang = TARGET_LANGUAGES.find((l) => l.code === language) || TARGET_LANGUAGES[0]

  return (
    <div className="lang-ctx" ref={ref}>
      {/* Native language */}
      <div className="lang-ctx__side">
        <button
          className="lang-ctx__trigger"
          onClick={() => setOpenMenu(openMenu === 'native' ? null : 'native')}
          aria-expanded={openMenu === 'native'}
          aria-haspopup="listbox"
        >
          <span className="lang-ctx__prefix">I know</span>
          <span className="lang-ctx__lang">{nativeLang.label}</span>
          <Chevron />
        </button>
        {openMenu === 'native' && (
          <ul className="lang-ctx__menu" role="listbox">
            {NATIVE_LANGUAGES.filter((l) => l.code !== nativeLanguage).map((l) => (
              <li key={l.code}>
                <button
                  className="lang-ctx__option"
                  role="option"
                  onClick={() => { setNativeLanguage(l.code); setOpenMenu(null) }}
                >
                  <span className="lang-ctx__flag">{l.flag}</span> {l.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Target language */}
      <div className="lang-ctx__side">
        <button
          className="lang-ctx__trigger"
          onClick={() => setOpenMenu(openMenu === 'target' ? null : 'target')}
          aria-expanded={openMenu === 'target'}
          aria-haspopup="listbox"
        >
          <span className="lang-ctx__prefix">I'm learning</span>
          <span className="lang-ctx__lang">{targetLang.label}</span>
          <Chevron />
        </button>
        {openMenu === 'target' && (
          <ul className="lang-ctx__menu" role="listbox">
            {TARGET_LANGUAGES.filter((l) => l.code !== language).map((l) => (
              <li key={l.code}>
                <button
                  className="lang-ctx__option"
                  role="option"
                  onClick={() => { switchLanguage(l.code as SupportedLanguage); setOpenMenu(null) }}
                >
                  <span className="lang-ctx__flag">{l.flag}</span> {l.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Chevron() {
  return (
    <svg className="lang-ctx__chevron" viewBox="0 0 12 12" fill="none">
      <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
