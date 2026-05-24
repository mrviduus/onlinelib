import { useCallback, useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { useRouter, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { libraryApi, readingProgressApi, userBooksApi, getStorageUrl, pickContinueReadingBook } from '@textstack/shared'
import type { UserLibraryItem, ReadingProgressDto, UserBookDto, ContinueReadingPick } from '@textstack/shared'
import { useTheme } from '../context/ThemeContext'
import { fonts } from '../theme/typography'
import { PressableScale } from './ui/PressableScale'
import { getAllLocalProgress, getAllUserBookLocalProgress } from '../lib/progressStorage'

export function ContinueReadingCard() {
  const { colors } = useTheme()
  const router = useRouter()
  const [book, setBook] = useState<ContinueReadingPick | null>(null)

  // Refetch on focus so the card reflects the latest progress after the user
  // returns from the reader. Plain useEffect would leave stale data on the home tab.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      ;(async () => {
        try {
          // Server calls can 401 or fail when offline — tolerate each independently so a
          // single failure doesn't wipe out the card. Local progress is the offline fallback.
          const [library, serverProgress, userBooks, localCatalogMap, localUserBookMap] = await Promise.all([
            libraryApi.getLibrary().catch(() => [] as UserLibraryItem[]),
            readingProgressApi.getAllProgress().catch(() => [] as ReadingProgressDto[]),
            userBooksApi.getUserBooks().catch(() => [] as UserBookDto[]),
            getAllLocalProgress(),
            getAllUserBookLocalProgress(),
          ])
          if (cancelled) return

          // LWW merge + book-percent selection lives in @textstack/shared
          // (`continueReading.ts`) — 23 unit tests cover catalog/user-book
          // mixes, grace window, malformed timestamps, chapter mismatches.
          // Component is now adaptor-only.
          const best = pickContinueReadingBook({
            library,
            serverProgress,
            userBooks,
            localCatalogMap,
            localUserBookMap,
          })

          if (!cancelled) setBook(best)
        } catch (e) {
          if (!cancelled) console.warn('Continue reading load failed:', e)
        }
      })()
      return () => { cancelled = true }
    }, [])
  )

  if (!book) return null

  const percentDisplay = Math.round(book.percent * 100)

  return (
    <PressableScale
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      accessibilityRole="button"
      accessibilityLabel={`Continue reading ${book.title}, ${percentDisplay} percent complete`}
      onPress={() => {
        if (book.type === 'edition') {
          router.push(book.chapterSlug ? `/reader/${book.slug}/${book.chapterSlug}` : `/book/${book.slug}`)
        } else {
          // Route is `/my-books/read/[bookId]/[chapterSlug]` — the segments
          // were swapped here, so expo-router couldn't match the path and
          // silently fell back to `/my-books/[id]`, making Continue Reading
          // look broken for user-uploaded books.
          router.push(book.chapterSlug ? `/my-books/read/${book.id}/${book.chapterSlug}` : `/my-books/${book.id}`)
        }
      }}
    >
      {book.coverPath ? (
        <Image
          source={getStorageUrl(book.coverPath)}
          style={styles.cover}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.cover, styles.coverPlaceholder, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name="book" size={24} color={colors.primary} />
        </View>
      )}
      <View style={styles.info}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Continue Reading</Text>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>{book.title}</Text>
        <View style={styles.progressRow}>
          <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
            <View style={[styles.progressFill, { width: `${percentDisplay}%`, backgroundColor: colors.primary }]} />
          </View>
          <Text style={[styles.percent, { color: colors.textSecondary }]}>{percentDisplay}%</Text>
        </View>
      </View>
      <View style={[styles.playBtn, { backgroundColor: colors.primary }]}>
        <Ionicons name="play" size={18} color="#fff" />
      </View>
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  cover: {
    width: 48,
    height: 68,
    borderRadius: 6,
  },
  coverPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    flex: 1,
    gap: 4,
  },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    lineHeight: 20,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  progressBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },
  percent: {
    fontFamily: fonts.sans,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 2,
  },
})
