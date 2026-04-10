import { useEffect, useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { libraryApi, readingProgressApi, userBooksApi, getStorageUrl } from '@textstack/shared'
import type { UserLibraryItem, ReadingProgressDto, UserBookDto } from '@textstack/shared'
import { useTheme } from '../context/ThemeContext'
import { fonts } from '../theme/typography'
import { PressableScale } from './ui/PressableScale'

type ContinueBook =
  | { type: 'edition'; slug: string; title: string; coverPath: string | null; percent: number; chapterSlug: string | null }
  | { type: 'userbook'; id: string; title: string; coverPath: string | null; percent: number; chapterSlug: string | null }

export function ContinueReadingCard() {
  const { colors } = useTheme()
  const router = useRouter()
  const [book, setBook] = useState<ContinueBook | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const [library, progress, userBooks] = await Promise.all([
          libraryApi.getLibrary(),
          readingProgressApi.getAllProgress(),
          userBooksApi.getUserBooks(),
        ])

        const progressMap = new Map<string, ReadingProgressDto>()
        for (const p of progress) progressMap.set(p.editionId, p)

        let best: ContinueBook | null = null
        let bestUpdatedAt = ''

        // Check library editions
        for (const item of library) {
          const p = progressMap.get(item.editionId)
          if (!p || p.percent == null || p.percent >= 1) continue
          if (!best || p.updatedAt > bestUpdatedAt) {
            best = { type: 'edition', slug: item.slug, title: item.title, coverPath: item.coverPath, percent: p.percent, chapterSlug: p.chapterSlug }
            bestUpdatedAt = p.updatedAt
          }
        }

        // Check user-uploaded books
        for (const ub of userBooks) {
          if (ub.status.toLowerCase() !== 'ready' || !ub.progressPercent || ub.progressPercent >= 1) continue
          if (!ub.progressUpdatedAt) continue
          if (!best || ub.progressUpdatedAt > bestUpdatedAt) {
            best = { type: 'userbook', id: ub.id, title: ub.title || 'Untitled', coverPath: ub.coverPath, percent: ub.progressPercent, chapterSlug: ub.progressChapterSlug }
            bestUpdatedAt = ub.progressUpdatedAt
          }
        }

        setBook(best)
      } catch {}
    })()
  }, [])

  if (!book) return null

  const percentDisplay = Math.round(book.percent * 100)

  return (
    <PressableScale
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={() => {
        if (book.type === 'edition') {
          router.push(book.chapterSlug ? `/reader/${book.slug}/${book.chapterSlug}` : `/book/${book.slug}`)
        } else {
          router.push(book.chapterSlug ? `/my-books/${book.id}/read/${book.chapterSlug}` : `/my-books/${book.id}`)
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
