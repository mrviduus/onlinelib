import { View, Text, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LanguageList } from '../../src/components/LanguageList'
import { useNativeLanguage } from '../../src/context/NativeLanguageContext'
import { useLanguage } from '../../src/context/LanguageContext'
import { useTheme } from '../../src/context/ThemeContext'
import { fonts } from '../../src/theme/typography'

/**
 * The one question the product cannot run without.
 *
 * TextStack translates the book's language into the reader's own. Without
 * knowing the second half of that pair there is nothing to translate into, so
 * the app guessed English — and then translated English into English for every
 * new account, turning its core feature into a no-op. A manual QA pass caught it
 * on a five-minute-old account: Profile read "I know: English / Learning:
 * English" while the server had `nativeLanguage: null`.
 *
 * **One question, not two.** The QA report proposed asking what you know and
 * what you are learning. There is only one answer to the second — `TARGET_LANGUAGES`
 * is `NATIVE_LANGUAGES.filter(code === 'en')` — and a question with one possible
 * answer is not a question, it is the dead "Learning: English" chip the same
 * report filed separately as P3-4.
 *
 * **No skip button, deliberately.** Skipping would put the reader back in the
 * exact state this screen exists to end: a guessed value that nothing can tell
 * apart from a chosen one. There is no dead end either — the list is searchable,
 * English sits at the top of Popular, and a reader who genuinely knows English
 * best answers in one tap. The difference is that it is now an answer instead of
 * a silence, which is the whole point.
 */
export default function LanguageOnboardingScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { colors } = useTheme()
  const { t } = useLanguage()
  const { nativeLanguage, setNativeLanguage } = useNativeLanguage()

  const handleSelect = (code: string) => {
    // Marks the choice confirmed and pushes it to the profile — see
    // NativeLanguageContext.setNativeLanguage.
    setNativeLanguage(code)
    // replace, not push: there is nothing to go back to, and Android's hardware
    // Back must not return the reader to a question they have answered.
    router.replace('/(tabs)/library')
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: insets.top + 24, paddingBottom: insets.bottom },
      ]}
    >
      <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
        {t('onboarding.nativeLanguageTitle')}
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        {t('onboarding.nativeLanguageSubtitle')}
      </Text>
      <LanguageList value={nativeLanguage} onSelect={handleSelect} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  title: { fontSize: 24, fontFamily: fonts.sansBold, marginBottom: 8 },
  subtitle: { fontSize: 14, fontFamily: fonts.sans, lineHeight: 20, marginBottom: 20 },
})
