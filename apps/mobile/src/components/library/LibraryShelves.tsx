import { View, Text, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '../../context/ThemeContext'
import { useLanguage } from '../../context/LanguageContext'
import { fonts } from '../../theme/typography'
import { useLibraryShelves } from '../../hooks/useLibraryShelves'
import { LibraryShelf } from './LibraryShelf'
import { PressableScale } from '../ui/PressableScale'

interface Props {
  hasAnyContent: boolean
}

export function LibraryShelves({ hasAnyContent }: Props) {
  const { colors } = useTheme()
  const { t } = useLanguage()
  const router = useRouter()
  const { shelves, loading, error } = useLibraryShelves()

  if (loading && !shelves) return null
  if (error || !shelves) return null

  const allEmpty =
    shelves.continueReading.length === 0 &&
    shelves.recentlyAdded.length === 0 &&
    shelves.quickReads.length === 0 &&
    shelves.finishedThisMonth.length === 0

  if (allEmpty && !hasAnyContent) {
    return (
      <View style={styles.empty}>
        <Text style={styles.icon}>📚</Text>
        <Text style={[styles.title, { color: colors.text }]}>{t('library.shelves.empty.title')}</Text>
        <Text style={[styles.copy, { color: colors.textSecondary }]}>{t('library.shelves.empty.copy')}</Text>
        <PressableScale
          accessibilityRole="button"
          onPress={() => router.push('/' as never)}
          style={[styles.cta, { borderColor: colors.primary }]}
        >
          <Text style={[styles.ctaText, { color: colors.primary }]}>{t('library.shelves.empty.browseCatalog')}</Text>
        </PressableScale>
      </View>
    )
  }

  if (allEmpty) return null

  return (
    <View>
      <LibraryShelf
        shelfId="continueReading"
        title={t('library.shelves.continueReading.title')}
        subtitle={t('library.shelves.continueReading.subtitle')}
        items={shelves.continueReading}
        viewAllHref="/library/shelf/continueReading"
      />
      <LibraryShelf
        shelfId="recentlyAdded"
        title={t('library.shelves.recentlyAdded.title')}
        subtitle={t('library.shelves.recentlyAdded.subtitle')}
        items={shelves.recentlyAdded}
        viewAllHref="/library/shelf/recentlyAdded"
      />
      <LibraryShelf
        shelfId="quickReads"
        title={t('library.shelves.quickReads.title')}
        subtitle={t('library.shelves.quickReads.subtitle')}
        items={shelves.quickReads}
      />
      <LibraryShelf
        shelfId="finishedThisMonth"
        title={t('library.shelves.finishedThisMonth.title')}
        subtitle={t('library.shelves.finishedThisMonth.subtitle')}
        items={shelves.finishedThisMonth}
        viewAllHref="/library/shelf/finishedThisMonth"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24 },
  icon: { fontSize: 48, marginBottom: 8 },
  title: { fontFamily: fonts.serifBold, fontSize: 18, marginBottom: 6 },
  copy: { fontFamily: fonts.sans, fontSize: 13, textAlign: 'center', marginBottom: 16, lineHeight: 19 },
  cta: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 8 },
  ctaText: { fontFamily: fonts.sansMedium, fontSize: 13 },
})
