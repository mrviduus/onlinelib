import { View, Text, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../context/ThemeContext'
import { useLanguage } from '../../context/LanguageContext'
import { fonts } from '../../theme/typography'
import { PressableScale } from '../ui/PressableScale'

/**
 * What a signed-in account with no books sees on the front door.
 *
 * One primary action, because the product is a reader for books you already
 * want to finish — uploading one is the only thing that makes the rest of the
 * app do anything. The catalog is offered underneath as a plain text link, not
 * a second button: two equal buttons is a decision, and there is nothing to
 * decide here.
 *
 * The copy names the tap-a-word loop, since that is the feature a new user
 * cannot discover on their own and the reason to read here rather than in any
 * other reader.
 */
export function FirstBookState() {
  const { colors } = useTheme()
  const { t } = useLanguage()
  const router = useRouter()

  return (
    <View style={styles.wrap}>
      <Ionicons name="book-outline" size={44} color={colors.primary} />
      <Text style={[styles.title, { color: colors.text }]}>{t('library.firstBook.title')}</Text>
      <Text style={[styles.copy, { color: colors.textSecondary }]}>{t('library.firstBook.copy')}</Text>

      <PressableScale
        accessibilityRole="button"
        onPress={() => router.push('/my-books/upload')}
        style={[styles.cta, { backgroundColor: colors.primary }]}
      >
        <Ionicons name="add" size={18} color="#fff" />
        <Text style={styles.ctaText}>{t('library.firstBook.upload')}</Text>
      </PressableScale>

      <PressableScale
        accessibilityRole="button"
        onPress={() => router.push('/(tabs)/search')}
        style={styles.secondary}
      >
        <Text style={[styles.secondaryText, { color: colors.textSecondary }]}>
          {t('library.firstBook.browse')}
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
