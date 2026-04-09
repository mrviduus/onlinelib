import { useState } from 'react'
import { useNativeLanguage, NATIVE_LANGUAGES, getFlagUrl } from '../context/NativeLanguageContext'
import '../styles/native-language-picker.css'

const STORAGE_KEY = 'textstack_native_language'

export function NativeLanguagePicker() {
  const { nativeLanguage, setNativeLanguage } = useNativeLanguage()
  const [visible, setVisible] = useState(() => {
    try { return !localStorage.getItem(STORAGE_KEY) } catch { return false }
  })

  if (!visible) return null

  const handleSelect = (code: string) => {
    setNativeLanguage(code)
    setVisible(false)
  }

  return (
    <div className="native-lang-picker" onClick={() => setVisible(false)}>
      <div className="native-lang-picker__card" onClick={e => e.stopPropagation()}>
        <span className="material-icons-outlined native-lang-picker__icon">translate</span>
        <h2 className="native-lang-picker__title">I speak</h2>
        <p className="native-lang-picker__desc">Choose your language for translations</p>
        <div className="native-lang-picker__grid">
          {NATIVE_LANGUAGES.map(lang => (
            <button
              key={lang.code}
              className={`native-lang-picker__btn${lang.code === nativeLanguage ? ' native-lang-picker__btn--active' : ''}`}
              onClick={() => handleSelect(lang.code)}
            >
              <img src={getFlagUrl(lang.code)} alt="" width="20" height="15" />
              {lang.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
