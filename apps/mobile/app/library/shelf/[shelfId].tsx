import { useMemo } from 'react'
import { FlatList, View, Text, StyleSheet, useWindowDimensions, TouchableOpacity, ActivityIndicator } from 'react-native'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getStorageUrl } from '@textstack/shared'
import type { LibraryShelfItem, LibraryShelves } from '@textstack/shared'
import { useTheme } from '../../../src/context/ThemeContext'
import { useLanguage } from '../../../src/context/LanguageContext'
import { fonts } from '../../../src/theme/typography'
import { useLibraryShelves } from '../../../src/hooks/useLibraryShelves'

type ShelfId = keyof LibraryShelves

const VALID: ShelfId[] = ['continueReading', 'recentlyAdded', 'quickReads', 'finishedThisMonth']

function isValidShelf(s: string | undefined): s is ShelfId {
  return !!s && (VALID as string[]).includes(s)
}

function itemRoute(it: LibraryShelfItem): string {
  if (it.type === 'userbook') return `/my-books/${it.id}`
  return `/books/${it.slug ?? ''}`
}

export default function LibraryShelfScreen() {
  const { shelfId } = useLocalSearchParams<{ shelfId: string }>()
  const router = useRouter()
  const { colors } = useTheme()
  const { t } = useLanguage()
  const { width } = useWindowDimensions()
  const { shelves, loading } = useLibraryShelves()

  const numColumns = Math.max(2, Math.floor(width / 130))
  const cardW = (width - 14 * 2 - 12 * (numColumns - 1)) / numColumns

  const valid = isValidShelf(shelfId)
  const items = useMemo(() => {
    if (!valid || !shelves) return []
    return shelves[shelfId]
  }, [valid, shelves, shelfId])

  const title = valid ? t(`library.shelves.${shelfId}.title`) : t('library.title')
  const subtitle = valid ? t(`library.shelves.${shelfId}.subtitle`) : ''

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title }} />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{title}</Text>
          {!!subtitle && <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>{subtitle}</Text>}
        </View>
      </View>

      {!valid ? (
        <View style={styles.center}>
          <Text style={[styles.empty, { color: colors.textSecondary }]}>Unknown shelf</Text>
        </View>
      ) : loading && items.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.empty, { color: colors.textSecondary }]}>{t('library.shelves.empty.title')}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => `${it.type}-${it.id}`}
          numColumns={numColumns}
          columnWrapperStyle={{ gap: 12 }}
          contentContainerStyle={styles.gridContent}
          renderItem={({ item }) => {
            const cover = item.coverPath ? getStorageUrl(item.coverPath) : undefined
            const percent = Math.round(item.progressPercent * 100)
            const showProgress = item.progressPercent > 0 && item.progressPercent < 1
            return (
              <TouchableOpacity
                style={{ width: cardW, marginBottom: 16 }}
                onPress={() => router.push(itemRoute(item) as never)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={item.title}
              >
                <View style={[styles.cover, { width: cardW, height: cardW * 1.5, backgroundColor: colors.border }]}>
                  {cover ? (
                    <Image source={cover} style={styles.coverImg} contentFit="cover" />
                  ) : (
                    <View style={[styles.coverImg, styles.coverPlaceholder, { backgroundColor: colors.primaryLight }]}>
                      <Ionicons name="book" size={26} color={colors.primary} />
                    </View>
                  )}
                  {showProgress && (
                    <View style={[styles.progressTrack, { backgroundColor: 'rgba(0,0,0,0.25)' }]}>
                      <View style={[styles.progressFill, { width: `${percent}%`, backgroundColor: colors.primary }]} />
                    </View>
                  )}
                </View>
                <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
                {!!item.author && (
                  <Text style={[styles.cardAuthor, { color: colors.textSecondary }]} numberOfLines={1}>{item.author}</Text>
                )}
                {showProgress && (
                  <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>{percent}%</Text>
                )}
              </TouchableOpacity>
            )
          }}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: { fontFamily: fonts.serifBold, fontSize: 18 },
  subtitle: { fontFamily: fonts.sans, fontSize: 12, marginTop: 2, opacity: 0.8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  empty: { fontFamily: fonts.sans, fontSize: 14 },
  gridContent: { paddingHorizontal: 14, paddingBottom: 32 },
  cover: { borderRadius: 8, overflow: 'hidden', position: 'relative' },
  coverImg: { width: '100%', height: '100%', borderRadius: 8 },
  coverPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  progressTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3 },
  progressFill: { height: '100%' },
  cardTitle: { fontFamily: fonts.sansMedium, fontSize: 13, marginTop: 6 },
  cardAuthor: { fontFamily: fonts.sans, fontSize: 11, marginTop: 1 },
  cardMeta: { fontFamily: fonts.sans, fontSize: 11, marginTop: 1, fontVariant: ['tabular-nums'] },
})
