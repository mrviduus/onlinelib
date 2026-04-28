import { ScrollView, View, Text, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getStorageUrl } from '@textstack/shared'
import type { LibraryShelfItem } from '@textstack/shared'
import { useTheme } from '../../context/ThemeContext'
import { fonts } from '../../theme/typography'
import { PressableScale } from '../ui/PressableScale'

const COVER_W = 110
const COVER_RATIO = 1.5

function itemRoute(it: LibraryShelfItem): string {
  if (it.type === 'userbook') return `/my-books/${it.id}`
  return `/books/${it.slug ?? ''}`
}

interface Props {
  shelfId: 'continueReading' | 'recentlyAdded' | 'quickReads' | 'finishedThisMonth'
  title: string
  subtitle?: string
  items: LibraryShelfItem[]
}

export function LibraryShelf({ title, subtitle, items }: Props) {
  const { colors } = useTheme()
  const router = useRouter()

  if (items.length === 0) return null

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
        ) : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        contentContainerStyle={styles.track}
      >
        {items.map((it) => {
          const cover = it.coverPath
            ? (it.type === 'userbook' ? `${getStorageUrl(it.coverPath)}` : getStorageUrl(it.coverPath))
            : undefined
          const percent = Math.round(it.progressPercent * 100)
          const showProgress = it.progressPercent > 0 && it.progressPercent < 1
          return (
            <PressableScale
              key={`${it.type}-${it.id}`}
              style={{ width: COVER_W }}
              onPress={() => router.push(itemRoute(it) as never)}
              accessibilityRole="button"
              accessibilityLabel={it.title}
            >
              <View style={[styles.coverWrap, { width: COVER_W, height: COVER_W * COVER_RATIO }]}>
                {cover ? (
                  <Image
                    source={cover}
                    style={[styles.cover, { backgroundColor: colors.border }]}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.cover, styles.coverPlaceholder, { backgroundColor: colors.primaryLight }]}>
                    <Ionicons name="book" size={26} color={colors.primary} />
                  </View>
                )}
                {showProgress && (
                  <View style={[styles.progressTrack, { backgroundColor: 'rgba(0,0,0,0.25)' }]}>
                    <View style={[styles.progressFill, { width: `${percent}%`, backgroundColor: colors.primary }]} />
                  </View>
                )}
              </View>
              <Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={1}>{it.title}</Text>
              {it.author ? (
                <Text style={[styles.itemAuthor, { color: colors.textSecondary }]} numberOfLines={1}>{it.author}</Text>
              ) : null}
              {showProgress ? (
                <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>{percent}%</Text>
              ) : it.estimatedMinutesRemaining != null && it.estimatedMinutesRemaining > 0 ? (
                <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>{it.estimatedMinutesRemaining} min</Text>
              ) : null}
            </PressableScale>
          )
        })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  section: { paddingTop: 12, paddingBottom: 6 },
  head: { paddingHorizontal: 14, marginBottom: 8 },
  title: { fontFamily: fonts.serifBold, fontSize: 16 },
  subtitle: { fontFamily: fonts.sans, fontSize: 11, marginTop: 2, opacity: 0.7 },
  track: { paddingHorizontal: 14, gap: 12 },
  coverWrap: { position: 'relative', borderRadius: 8, overflow: 'hidden' },
  cover: { width: '100%', height: '100%', borderRadius: 8 },
  coverPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  progressTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3 },
  progressFill: { height: '100%' },
  itemTitle: { fontFamily: fonts.sansMedium, fontSize: 12, marginTop: 6 },
  itemAuthor: { fontFamily: fonts.sans, fontSize: 11, marginTop: 1 },
  itemMeta: { fontFamily: fonts.sans, fontSize: 11, marginTop: 1, fontVariant: ['tabular-nums'] },
})
