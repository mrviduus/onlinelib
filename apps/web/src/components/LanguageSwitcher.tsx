import { useLanguage, SupportedLanguage } from '../context/LanguageContext'

const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  uk: 'UA',
  en: 'EN',
}

const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  uk: 'Українська',
  en: 'English',
}

export function LanguageSwitcher() {
  const { language, supportedLanguages, switchLanguage } = useLanguage()

  return (
    <nav className="lang-switcher" aria-label="Language selection">
      {supportedLanguages.map((lang) => {
        const isActive = lang === language
        return (
          <button
            key={lang}
            onClick={() => switchLanguage(lang as SupportedLanguage)}
            className={`lang-switcher__btn ${isActive ? 'lang-switcher__btn--active' : ''}`}
            aria-current={isActive ? 'true' : undefined}
            aria-label={`Switch to ${LANGUAGE_NAMES[lang as SupportedLanguage]}`}
            title={LANGUAGE_NAMES[lang as SupportedLanguage]}
          >
            {LANGUAGE_LABELS[lang as SupportedLanguage]}
          </button>
        )
      })}
    </nav>
  )
}
