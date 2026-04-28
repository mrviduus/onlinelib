import { ScrollView, View, Text, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getStorageUrl } from '@textstack/shared'
import { useContinueReadingList, type ContinueItem } from '../../hooks/useContinueReadingList'
import { useTheme } from '../../context/ThemeContext'
import { useLanguage } from '../../context/LanguageContext'
import { fonts } from '../../theme/typography'
import { PressableScale } from '../ui/PressableScale'

const COVER_W = 120
const COVER_W_FIRST = 132
const COVER_RATIO = 1.5 // height / width

function itemKey(it: ContinueItem): string {
  return it.kind === 'edition' ? `e-${it.item.editionId}` : `u-${it.book.id}`
}

function itemTitle(it: ContinueItem): string {
  return it.kind === 'edition' ? it.item.title : (it.book.title || 'Untitled')
}

function itemAuthor(it: ContinueItem): string | null {
  return it.kind === 'edition' ? null : it.book.author
}

function itemCover(it: ContinueItem): string | undefined {
  const path = it.kind === 'edition' ? it.item.coverPath : it.book.coverPath
  return path ? getStorageUrl(path) : undefined
}

function itemRoute(it: ContinueItem): string {
  if (it.kind === 'edition') {
    return `/reader/${it.item.slug}/${it.progress.chapterSlug}`
  }
  return `/my-books/read/${it.book.id}/${it.book.progressChapterSlug}`
}

export function ContinueReadingShelf() {
  const { colors } = useTheme()
  const { t } = useLanguage()
  const router = useRouter()
  const { items, loading } = useContinueReadingList(5)

  if (loading || items.length === 0) return null

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: colors.text }]}>{t('library.continueShelf.title')}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        contentContainerStyle={styles.track}
      >
        {items.map((it, idx) => {
          const cover = itemCover(it)
          const author = itemAuthor(it)
          const title = itemTitle(it)
          const percent = Math.round(it.percent * 100)
          const isFirst = idx === 0
          const w = isFirst ? COVER_W_FIRST : COVER_W
          return (
            <PressableScale
              key={itemKey(it)}
              style={{ width: w }}
              onPress={() => router.push(itemRoute(it) as never)}
              accessibilityRole="button"
              accessibilityLabel={`Continue reading ${title}, ${percent} percent complete`}
            >
              <View style={[styles.coverWrap, { width: w, height: w * COVER_RATIO }]}>
                {cover ? (
                  <Image
                    source={cover}
                    style={[styles.cover, { backgroundColor: colors.border }]}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.cover, styles.coverPlaceholder, { backgroundColor: colors.primaryLight }]}>
                    <Ionicons name="book" size={28} color={colors.primary} />
                  </View>
                )}
                {isFirst && (
                  <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.badgeText}>{t('library.continueShelf.badge')}</Text>
                  </View>
                )}
                <View style={[styles.progressTrack, { backgroundColor: 'rgba(0,0,0,0.25)' }]}>
                  <View style={[styles.progressFill, { width: `${percent}%`, backgroundColor: colors.primary }]} />
                </View>
              </View>
              <Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={1}>{title}</Text>
              {author ? (
                <Text style={[styles.itemAuthor, { color: colors.textSecondary }]} numberOfLines={1}>{author}</Text>
              ) : null}
              <Text style={[styles.itemPercent, { color: colors.textSecondary }]}>{percent}%</Text>
            </PressableScale>
          )
        })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  section: { paddingTop: 12, paddingBottom: 6 },
  title: {
    fontFamily: fonts.serifBold,
    fontSize: 16,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  track: { paddingHorizontal: 14, gap: 12 },
  coverWrap: {
    position: 'relative',
    borderRadius: 8,
    overflow: 'hidden',
  },
  cover: { width: '100%', height: '100%', borderRadius: 8 },
  coverPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: { color: '#fff', fontFamily: fonts.sansMedium, fontSize: 10 },
  progressTrack: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    height: 3,
  },
  progressFill: { height: '100%' },
  itemTitle: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    marginTop: 6,
  },
  itemAuthor: {
    fontFamily: fonts.sans,
    fontSize: 11,
    marginTop: 1,
  },
  itemPercent: {
    fontFamily: fonts.sans,
    fontSize: 11,
    marginTop: 1,
    fontVariant: ['tabular-nums'],
  },
})
