import { View, Text, ScrollView, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { getStorageUrl } from '@textstack/shared'
import type { ContinueReadingPick } from '@textstack/shared'
import { useTheme } from '../../context/ThemeContext'
import { useLanguage } from '../../context/LanguageContext'
import { fonts } from '../../theme/typography'
import { PressableScale } from '../ui/PressableScale'
import { GeneratedCover } from './GeneratedCover'
import { resumeRoute } from '../../lib/bookRoutes'

const COVER_W = 84
const COVER_H = 126

/**
 * The books behind the hero — everything else the reader has open, newest first.
 *
 * Deliberately not the same thing as the "Continue reading" shelf it replaced:
 * that shelf came from `/me/library/shelves`, whose payload has no chapter slug,
 * so its items could only open a detail page. These items resume.
 */
export function JumpBackInRail({ picks }: { picks: ContinueReadingPick[] }) {
  const { colors } = useTheme()
  const { t } = useLanguage()
  const router = useRouter()

  if (picks.length === 0) return null

  return (
    <View style={styles.wrap}>
      <Text style={[styles.heading, { color: colors.text }]}>{t('library.resume.jumpBackIn')}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {picks.map(p => {
          const percent = Math.round(p.percent * 100)
          const cover = p.coverPath ? getStorageUrl(p.coverPath) : null
          const key = p.type === 'edition' ? `ed:${p.slug}` : `ub:${p.id}`
          return (
            <PressableScale
              key={key}
              accessibilityRole="button"
              accessibilityLabel={t('library.resume.a11yResume')
                .replace('{title}', p.title)
                .replace('{percent}', String(percent))}
              onPress={() => router.push(resumeRoute(p) as never)}
              style={styles.item}
            >
              {cover ? (
                <Image source={cover} style={styles.cover} contentFit="cover" transition={150} />
              ) : (
                <GeneratedCover title={p.title} style={styles.cover} />
              )}
              <View style={[styles.track, { backgroundColor: colors.textSecondary + '25' }]}>
                <View style={[styles.fill, { width: `${percent}%`, backgroundColor: colors.primary }]} />
              </View>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
                {p.title}
              </Text>
            </PressableScale>
          )
        })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginTop: 14 },
  heading: { fontFamily: fonts.serifBold, fontSize: 16, paddingHorizontal: 14, marginBottom: 8 },
  row: { paddingHorizontal: 14, gap: 12 },
  item: { width: COVER_W },
  cover: { width: COVER_W, height: COVER_H, borderRadius: 6 },
  track: { height: 3, borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
  title: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 15, marginTop: 5 },
})
