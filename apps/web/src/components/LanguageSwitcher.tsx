import { useNativeLanguage } from '../context/NativeLanguageContext'
import { LanguagePicker } from './LanguagePicker'

export function LanguageSwitcher() {
  const { nativeLanguage, setNativeLanguage } = useNativeLanguage()

  return (
    <div className="lang-ctx">
      <LanguagePicker
        value={nativeLanguage}
        onChange={setNativeLanguage}
        ariaLabel="Native language"
        prefix="I know"
        excludeCode="en"
      />
    </div>
  )
}
