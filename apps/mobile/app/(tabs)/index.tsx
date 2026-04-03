import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, FlatList,
} from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { createBooksApi, getStorageUrl, vocabularyApi, getVocabLevel } from '@textstack/shared'
import type { Edition, Author } from '@textstack/shared'
import { useAuth } from '../../src/context/AuthContext'
import { useTheme } from '../../src/context/ThemeContext'
import { useLanguage } from '../../src/context/LanguageContext'
import { fonts } from '../../src/theme/typography'
import { BookCard } from '../../src/components/ui/BookCard'
import { BookGridSkeleton } from '../../src/components/ui/SkeletonLoader'
import { useQuickStats } from '../../src/hooks/useQuickStats'

const BOOK_LIMIT = 12
const AUTHOR_LIMIT = 8

export default function HomeScreen() {
  const router = useRouter()
  const { colors } = useTheme()
  const { language } = useLanguage()
  const { isAuthenticated } = useAuth()
  const quickStats = useQuickStats(isAuthenticated)

  const [books, setBooks] = useState<Edition[]>([])
  const [authors, setAuthors] = useState<Author[]>([])
  const [catalogStats, setCatalogStats] = useState<{ books: number; authors: number; genres: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [vocabDueCount, setVocabDueCount] = useState(0)
  const [vocabLevel, setVocabLevel] = useState(0)

  const fetchAll = useCallback(async () => {
    const api = createBooksApi(language)
    try {
      const [booksRes, authorsRes, genresRes] = await Promise.all([
        api.getBooks({ limit: BOOK_LIMIT }),
        api.getAuthors({ limit: AUTHOR_LIMIT, sort: 'recent' }),
        api.getGenres(),
      ])
      setBooks(booksRes.items)
      setAuthors(authorsRes.items)
      setCatalogStats({
        books: booksRes.total,
        authors: authorsRes.total,
        genres: genresRes.total,
      })
    } catch (e) {
      console.error('Failed to fetch home data:', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [language])

  useEffect(() => {
    if (!isAuthenticated) return
    vocabularyApi.getVocabularyStats()
      .then(stats => {
        setVocabDueCount(stats.dueNow)
        setVocabLevel(getVocabLevel(stats.byStage.mastered).level)
      })
      .catch(() => {})
  }, [isAuthenticated])

  const onRefresh = () => {
    setRefreshing(true)
    fetchAll()
  }

  if (loading) {
    return (
      <ScrollView style={[styles.container, { backgroundColor: colors.bgWarm }]}>
        <HeroSection colors={colors} router={router} />
        <BookGridSkeleton count={6} />
      </ScrollView>
    )
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bgWarm }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* Hero */}
      <HeroSection colors={colors} router={router} />

      {/* Stats Bar */}
      {catalogStats && (
        <View style={[styles.statsBar, { borderColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.push('/books')}>
            <Text style={[styles.statItem, { color: colors.textSecondary }]}>
              {catalogStats.books} books
            </Text>
          </TouchableOpacity>
          <Text style={[styles.statDot, { color: colors.border }]}>&middot;</Text>
          <TouchableOpacity onPress={() => router.push('/authors')}>
            <Text style={[styles.statItem, { color: colors.textSecondary }]}>
              {catalogStats.authors} authors
            </Text>
          </TouchableOpacity>
          <Text style={[styles.statDot, { color: colors.border }]}>&middot;</Text>
          <TouchableOpacity onPress={() => router.push('/genres')}>
            <Text style={[styles.statItem, { color: colors.textSecondary }]}>
              {catalogStats.genres} genres
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Quick Reading Stats (authenticated) */}
      {quickStats && (
        <TouchableOpacity
          style={[styles.quickStats, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => router.push('/stats/')}
          activeOpacity={0.7}
        >
          <View style={styles.quickStatItem}>
            <Ionicons name="time-outline" size={16} color={colors.primary} />
            <Text style={[styles.quickStatValue, { color: colors.text }]}>
              {Math.round(quickStats.todaySeconds / 60)}m
            </Text>
            <Text style={[styles.quickStatLabel, { color: colors.textSecondary }]}>today</Text>
          </View>
          {quickStats.currentStreak > 0 && (
            <View style={styles.quickStatItem}>
              <Ionicons name="flame-outline" size={16} color={colors.primary} />
              <Text style={[styles.quickStatValue, { color: colors.text }]}>
                {quickStats.currentStreak}d
              </Text>
              <Text style={[styles.quickStatLabel, { color: colors.textSecondary }]}>streak</Text>
            </View>
          )}
          {vocabLevel > 0 && (
            <View style={styles.quickStatItem}>
              <Text style={{ fontSize: 14 }}>📚</Text>
              <Text style={[styles.quickStatValue, { color: colors.text }]}>
                Lv.{vocabLevel}
              </Text>
              <Text style={[styles.quickStatLabel, { color: colors.textSecondary }]}>vocab</Text>
            </View>
          )}
          {quickStats.dailyGoalMinutes && (
            <View style={styles.quickStatItem}>
              <Ionicons name="flag-outline" size={16} color={colors.primary} />
              <Text style={[styles.quickStatValue, { color: colors.text }]}>
                {Math.round(quickStats.todaySeconds / 60)}/{quickStats.dailyGoalMinutes}m
              </Text>
              <Text style={[styles.quickStatLabel, { color: colors.textSecondary }]}>goal</Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      )}

      {/* Vocab Review Card */}
      {vocabDueCount > 0 && (
        <TouchableOpacity
          style={[styles.reviewCard, { backgroundColor: 'rgba(59,130,246,0.06)', borderColor: 'rgba(59,130,246,0.15)' }]}
          onPress={() => router.push('/vocabulary/review')}
          activeOpacity={0.7}
        >
          <Text style={{ fontSize: 18, marginRight: 8 }}>📚</Text>
          <Text style={[styles.reviewCardText, { color: colors.text }]}>
            {vocabDueCount} word{vocabDueCount === 1 ? '' : 's'} due for review
          </Text>
          <View style={[styles.reviewCardBtn, { backgroundColor: colors.primary }]}>
            <Text style={{ color: '#fff', fontSize: 13, fontFamily: fonts.sansMedium }}>Review</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Recent Books */}
      {books.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Books</Text>
            <TouchableOpacity onPress={() => router.push('/books')} activeOpacity={0.7}>
              <View style={styles.viewAllRow}>
                <Text style={[styles.viewAllText, { color: colors.primary }]}>View All</Text>
                <Ionicons name="arrow-forward" size={16} color={colors.primary} />
              </View>
            </TouchableOpacity>
          </View>
          <View style={styles.booksGrid}>
            {books.map(book => (
              <BookCard
                key={book.id}
                title={book.title}
                author={book.authors.map(a => a.name).join(', ')}
                coverUrl={getStorageUrl(book.coverPath)}
                onPress={() => router.push(`/book/${book.slug}`)}
              />
            ))}
          </View>
        </View>
      )}

      {/* Recent Authors */}
      {authors.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Authors</Text>
            <TouchableOpacity onPress={() => router.push('/authors')} activeOpacity={0.7}>
              <View style={styles.viewAllRow}>
                <Text style={[styles.viewAllText, { color: colors.primary }]}>View All</Text>
                <Ionicons name="arrow-forward" size={16} color={colors.primary} />
              </View>
            </TouchableOpacity>
          </View>
          <FlatList
            data={authors}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.authorsScroll}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.authorCard}
                onPress={() => router.push(`/author/${item.slug}`)}
                activeOpacity={0.7}
              >
                {item.photoPath ? (
                  <Image source={getStorageUrl(item.photoPath)} style={styles.authorPhoto} contentFit="cover" />
                ) : (
                  <View style={[styles.authorPhoto, styles.authorPlaceholder, { backgroundColor: colors.primaryLight }]}>
                    <Text style={[styles.authorInitial, { color: colors.primary }]}>
                      {item.name?.[0] || '?'}
                    </Text>
                  </View>
                )}
                <Text style={[styles.authorName, { color: colors.text }]} numberOfLines={2}>
                  {item.name}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

function HeroSection({ colors, router }: { colors: any; router: any }) {
  return (
    <View style={[styles.hero, { backgroundColor: colors.bgWarm }]}>
      <Text style={[styles.heroTitle, { color: colors.text }]}>TextStack</Text>
      <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
        Read classic literature, build vocabulary
      </Text>
      <TouchableOpacity
        style={[styles.searchPill, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => router.push('/(tabs)/search')}
        activeOpacity={0.7}
      >
        <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
        <Text style={[styles.searchPlaceholder, { color: colors.textSecondary }]}>
          Search books...
        </Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    alignItems: 'center',
  },
  heroTitle: {
    fontFamily: fonts.serif,
    fontSize: 36,
    lineHeight: 42,
  },
  heroSubtitle: {
    fontFamily: fonts.serifItalic,
    fontSize: 15,
    marginTop: 4,
  },
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    width: '100%',
    gap: 8,
  },
  searchPlaceholder: {
    fontFamily: fonts.sans,
    fontSize: 15,
  },

  // Stats bar
  statsBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    marginHorizontal: 16,
  },
  statItem: { fontFamily: fonts.sansMedium, fontSize: 13 },
  statDot: { fontSize: 16 },

  // Quick stats
  quickStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 16,
  },
  quickStatItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  quickStatValue: { fontFamily: fonts.sansMedium, fontSize: 14 },
  quickStatLabel: { fontFamily: fonts.sans, fontSize: 12 },

  // Sections
  section: { marginTop: 24 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: { fontFamily: fonts.serifBold, fontSize: 20 },
  viewAllRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewAllText: { fontFamily: fonts.sansMedium, fontSize: 14 },

  // Books grid
  booksGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    justifyContent: 'space-between',
  },

  // Authors horizontal scroll
  authorsScroll: { paddingHorizontal: 16, gap: 14 },
  authorCard: { alignItems: 'center', width: 80 },
  authorPhoto: { width: 64, height: 64, borderRadius: 32, marginBottom: 6 },
  authorPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  authorInitial: { fontFamily: fonts.serif, fontSize: 24 },
  authorName: { fontFamily: fonts.sans, fontSize: 12, textAlign: 'center' },

  // Review card
  reviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  reviewCardText: { flex: 1, fontSize: 14, fontFamily: fonts.sans },
  reviewCardBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
})
