import { View, Text, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../context/ThemeContext'
import { useLanguage } from '../../context/LanguageContext'
import { useAuth } from '../../context/AuthContext'
import { capabilitiesFor } from '../../lib/capabilities'
import { fonts } from '../../theme/typography'
import { PressableScale } from '../ui/PressableScale'

/**
 * What a reader with no books sees on the front door.
 *
 * One primary action, because two equal buttons is a decision and there is
 * nothing to decide here. Which action is primary depends on which one the
 * reader can actually take:
 *
 *   - An account can upload, and uploading is what makes the rest of the app do
 *     anything for a book they already want to finish. Catalog underneath.
 *   - A guest cannot (`canUpload` is account-only — see `lib/capabilities.ts`),
 *     so the catalog is promoted and upload becomes the link that asks for an
 *     account. Offering a guest a primary "Upload a book" that lands on a
 *     sign-in wall would be the same broken promise the tap-a-word coachmark
 *     used to make.
 *
 * The copy names the tap-a-word loop in both variants, since that is the feature
 * a new reader cannot discover on their own and the reason to read here rather
 * than in any other reader.
 */
export function FirstBookState() {
  const { colors } = useTheme()
  const { t } = useLanguage()
  const { user } = useAuth()
  const router = useRouter()

  const { canUpload } = capabilitiesFor(user)

  const primary = canUpload
    ? { label: t('library.firstBook.upload'), icon: 'add' as const, go: () => router.push('/my-books/upload') }
    : { label: t('library.firstBook.guestBrowse'), icon: 'search' as const, go: () => router.push('/(tabs)/search') }

  const secondary = canUpload
    ? { label: t('library.firstBook.browse'), go: () => router.push('/(tabs)/search') }
    : { label: t('library.firstBook.guestUpload'), go: () => router.push('/(auth)/login') }

  return (
    <View style={styles.wrap}>
      <Ionicons name="book-outline" size={44} color={colors.primary} />
      <Text style={[styles.title, { color: colors.text }]}>{t('library.firstBook.title')}</Text>
      <Text style={[styles.copy, { color: colors.textSecondary }]}>
        {canUpload ? t('library.firstBook.copy') : t('library.firstBook.guestCopy')}
      </Text>

      <PressableScale
        accessibilityRole="button"
        onPress={primary.go}
        style={[styles.cta, { backgroundColor: colors.primary }]}
      >
        <Ionicons name={primary.icon} size={18} color="#fff" />
        <Text style={styles.ctaText}>{primary.label}</Text>
      </PressableScale>

      <PressableScale
        accessibilityRole="button"
        onPress={secondary.go}
        style={styles.secondary}
      >
        <Text style={[styles.secondaryText, { color: colors.textSecondary }]}>
          {secondary.label}
        </Text>
      </PressableScale>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 32, gap: 10 },
  title: { fontFamily: fonts.serifBold, fontSize: 20, marginTop: 6 },
  copy: { fontFamily: fonts.sans, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 999,
  },
  ctaText: { fontFamily: fonts.sansMedium, fontSize: 15, color: '#fff' },
  secondary: { paddingVertical: 8, paddingHorizontal: 12 },
  secondaryText: { fontFamily: fonts.sans, fontSize: 13, textDecorationLine: 'underline' },
})
