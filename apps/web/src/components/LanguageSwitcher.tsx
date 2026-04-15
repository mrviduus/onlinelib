import { useState, useRef, useEffect } from 'react'
import { useLanguage, SupportedLanguage } from '../context/LanguageContext'
import { useNativeLanguage, NATIVE_LANGUAGES, getFlagUrl } from '../context/NativeLanguageContext'
import { LanguagePicker } from './LanguagePicker'

const TARGET_LANGUAGES = NATIVE_LANGUAGES.filter((l) => l.code === 'en' || l.code === 'uk')

export function LanguageSwitcher() {
  const { language, switchLanguage } = useLanguage()
  const { nativeLanguage, setNativeLanguage } = useNativeLanguage()
  const [targetOpen, setTargetOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setTargetOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const targetLang = TARGET_LANGUAGES.find((l) => l.code === language) || TARGET_LANGUAGES[0]

  // Switching the reading language to the user's current native language would
  // collapse both pickers onto the same code (and blank the native trigger).
  // Swap them instead — preserve the user's known language by moving it to the
  // side that just got vacated.
  const handleSwitchTarget = (newCode: SupportedLanguage) => {
    if (newCode === nativeLanguage) {
      setNativeLanguage(language)
    }
    switchLanguage(newCode)
    setTargetOpen(false)
  }

  return (
    <div className="lang-ctx" ref={ref}>
      {/* Native language — searchable picker. excludeCode hides the language
          the user is reading from the list (and renders the trigger empty if
          they happen to match), since native == reading is meaningless. */}
      <LanguagePicker
        value={nativeLanguage}
        onChange={setNativeLanguage}
        ariaLabel="Native language"
        prefix="I know"
        excludeCode={language}
      />

      <span className="lang-ctx__arrow">→</span>

      {/* Target language — en/uk only */}
      <div className="lang-ctx__side">
        <button
          className="lang-ctx__trigger"
          onClick={() => setTargetOpen((o) => !o)}
          aria-expanded={targetOpen}
          aria-haspopup="listbox"
        >
          <img className="lang-ctx__flag" src={getFlagUrl(targetLang.code)} alt="" width="20" height="15" />
          <span className="lang-ctx__prefix">I'm learning</span>
          <span className="lang-ctx__lang">{targetLang.label}</span>
          <Chevron />
        </button>
        {targetOpen && (
          <ul className="lang-ctx__menu" role="listbox">
            {TARGET_LANGUAGES.filter((l) => l.code !== language).map((l) => (
              <li key={l.code}>
                <button
                  className="lang-ctx__option"
                  role="option"
                  onClick={() => handleSwitchTarget(l.code as SupportedLanguage)}
                >
                  <img className="lang-ctx__flag" src={getFlagUrl(l.code)} alt="" width="20" height="15" /> {l.label}
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
