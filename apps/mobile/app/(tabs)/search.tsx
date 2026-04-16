import { useState, useCallback, useEffect, useRef } from 'react'
import { View, Text, TextInput, FlatList, ScrollView, StyleSheet, TouchableOpacity } from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createBooksApi, getStorageUrl } from '@textstack/shared'
import type { SearchResult, Edition, Author } from '@textstack/shared'
import { useTheme } from '../../src/context/ThemeContext'
import { useLanguage } from '../../src/context/LanguageContext'
import { fonts } from '../../src/theme/typography'
import { SkeletonLoader, BookGridSkeleton } from '../../src/components/ui/SkeletonLoader'
import { BookCard } from '../../src/components/ui/BookCard'
import { EmptyState } from '../../src/components/ui/EmptyState'
import { trackSearchPerformed } from '../../src/lib/analytics'

/** Renders HTML search highlights with <b> tags as bold Text spans */
function HighlightText({ html, style, boldStyle, numberOfLines }: {
  html: string; style: any; boldStyle?: any; numberOfLines?: number
}) {
  const parts = html.split(/(<b>.*?<\/b>)/g)
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts.map((part, i) => {
        if (part.startsWith('<b>') && part.endsWith('</b>')) {
          const text = part.slice(3, -4)
          return <Text key={i} style={[{ fontWeight: '700' }, boldStyle]}>{text}</Text>
        }
        return part.replace(/<[^>]+>/g, '')
      })}
    </Text>
  )
}

const RECENT_KEY = 'textstack_recent_searches'
const MAX_RECENT = 8
const RESULTS_PER_PAGE = 10
const BOOK_LIMIT = 12
const AUTHOR_LIMIT = 8

interface EditionGroup {
  editionId: string
  slug: string
  title: string
  coverPath: string | null
  bestMatch: SearchResult
  otherMatches: SearchResult[]
}

function groupByEdition(results: SearchResult[]): EditionGroup[] {
  const map = new Map<string, SearchResult[]>()
  for (const r of results) {
    const key = r.edition.id
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(r)
  }
  return Array.from(map.entries()).map(([id, items]) => ({
    editionId: id,
    slug: items[0].edition.slug,
    title: items[0].edition.title,
    coverPath: items[0].edition.coverPath,
    bestMatch: items[0],
    otherMatches: items.slice(1),
  }))
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export default function DiscoverScreen() {
  const router = useRouter()
  const { colors } = useTheme()
  const { language, t } = useLanguage()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const [expandedEditions, setExpandedEditions] = useState<Set<string>>(new Set())
  const inputRef = useRef<TextInput>(null)

  // Catalog data
  const [books, setBooks] = useState<Edition[]>([])
  const [authors, setAuthors] = useState<Author[]>([])
  const [catalogStats, setCatalogStats] = useState<{ books: number; authors: number; genres: number } | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(true)

  const debouncedQuery = useDebounce(query.trim(), 300)

  // Load recent searches
  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY).then(v => {
      if (v) try { setRecentSearches(JSON.parse(v)) } catch {}
    })
  }, [])

  // Fetch catalog data
  useEffect(() => {
    const api = createBooksApi(language)
    Promise.all([
      api.getBooks({ limit: BOOK_LIMIT }),
      api.getAuthors({ limit: AUTHOR_LIMIT, sort: 'recent' }),
      api.getGenres(),
    ]).then(([booksRes, authorsRes, genresRes]) => {
      setBooks(booksRes.items)
      setAuthors(authorsRes.items)
      setCatalogStats({ books: booksRes.total, authors: authorsRes.total, genres: genresRes.total })
    }).catch(e => console.error('Catalog fetch failed:', e))
      .finally(() => setCatalogLoading(false))
  }, [language])

  const saveRecent = async (q: string) => {
    const updated = [q, ...recentSearches.filter(s => s !== q)].slice(0, MAX_RECENT)
    setRecentSearches(updated)
    await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(updated)).catch(() => {})
  }

  const removeRecent = async (q: string) => {
    const updated = recentSearches.filter(s => s !== q)
    setRecentSearches(updated)
    await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(updated)).catch(() => {})
  }

  const clearRecent = async () => {
    setRecentSearches([])
    await AsyncStorage.removeItem(RECENT_KEY).catch(() => {})
  }

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) return
    setLoading(true)
    setSearched(true)
    setPage(1)
    setExpandedEditions(new Set())
    try {
      const api = createBooksApi(language)
      const { items } = await api.search(q, { limit: 100, highlight: true })
      setResults(items)
      saveRecent(q)
      trackSearchPerformed({ query: q, resultsCount: items.length })
    } catch (e) {
      console.error('Search failed:', e)
    } finally {
      setLoading(false)
    }
  }, [recentSearches, language])

  // Auto-search on debounced query change
  useEffect(() => {
    if (debouncedQuery.length >= 2) doSearch(debouncedQuery)
    else if (debouncedQuery.length === 0 && searched) {
      setResults([])
      setSearched(false)
    }
  }, [debouncedQuery])

  const grouped = groupByEdition(results)
  const totalPages = Math.ceil(grouped.length / RESULTS_PER_PAGE)
  const paged = grouped.slice(0, page * RESULTS_PER_PAGE)
  const hasMore = page < totalPages

  const toggleExpand = (editionId: string) => {
    setExpandedEditions(prev => {
      const next = new Set(prev)
      if (next.has(editionId)) next.delete(editionId)
      else next.add(editionId)
      return next
    })
  }

  const renderGroup = ({ item }: { item: EditionGroup }) => {
    const isExpanded = expandedEditions.has(item.editionId)
    const highlights = (item.bestMatch.highlights || []).slice(0, 2)

    return (
      <TouchableOpacity
        style={[styles.resultCard, { backgroundColor: colors.surface }]}
        onPress={() => router.push(`/book/${item.slug}`)}
        activeOpacity={0.85}
      >
        <Image
          source={item.coverPath ? getStorageUrl(item.coverPath) : undefined}
          style={[styles.cover, { backgroundColor: colors.border }]}
          contentFit="cover"
        />
        <View style={styles.info}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
          <Text style={[styles.chapter, { color: colors.textSecondary }]} numberOfLines={1}>
            Ch. {item.bestMatch.chapterNumber}: {item.bestMatch.chapterTitle}
          </Text>
          {highlights.map((h, i) => (
            <HighlightText key={i} html={h} style={[styles.highlight, { color: colors.textSecondary }]} boldStyle={{ color: colors.text }} numberOfLines={2} />
          ))}

          {item.otherMatches.length > 0 && (
            <TouchableOpacity
              style={styles.moreBtn}
              onPress={() => toggleExpand(item.editionId)}
              hitSlop={8}
            >
              <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.primary }}>
                {isExpanded ? t('search.hideChapters') : `+${item.otherMatches.length} more match${item.otherMatches.length > 1 ? 'es' : ''}`}
              </Text>
              <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.primary} />
            </TouchableOpacity>
          )}

          {isExpanded && item.otherMatches.map((m, i) => (
            <View key={i} style={[styles.subMatch, { borderTopColor: colors.border }]}>
              <Text style={[styles.chapter, { color: colors.textSecondary }]} numberOfLines={1}>
                Ch. {m.chapterNumber}: {m.chapterTitle}
              </Text>
              {(m.highlights || []).slice(0, 2).map((h, hi) => (
                <HighlightText key={hi} html={h} style={[styles.highlight, { color: colors.textSecondary }]} boldStyle={{ color: colors.text }} numberOfLines={2} />
              ))}
            </View>
          ))}
        </View>
      </TouchableOpacity>
    )
  }

  const showRecent = !searched && !loading && query.length === 0 && recentSearches.length > 0
  const showCatalog = !searched && !loading

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.searchBar}>
        <View style={[styles.inputWrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
          <TextInput
            ref={inputRef}
            style={[styles.input, { color: colors.text }]}
            value={query}
            onChangeText={setQuery}
            placeholder={t('search.searchPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            returnKeyType="search"
            onSubmitEditing={() => doSearch(query.trim())}
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); setResults([]); setSearched(false) }}>
              <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.skeletonList}>
          {[0, 1, 2, 3].map(i => (
            <View key={i} style={[styles.resultCard, { backgroundColor: colors.surface }]}>
              <SkeletonLoader width={50} height={70} borderRadius={4} />
              <View style={styles.info}>
                <SkeletonLoader width="70%" height={14} />
                <SkeletonLoader width="50%" height={12} style={{ marginTop: 6 }} />
                <SkeletonLoader width="90%" height={12} style={{ marginTop: 6 }} />
              </View>
            </View>
          ))}
        </View>
      ) : results.length === 0 && searched ? (
        <EmptyState
          icon="search-outline"
          title={`${t('search.noResults')} "${query}"`}
        />
      ) : searched ? (
        <FlatList
          data={paged}
          renderItem={renderGroup}
          keyExtractor={item => item.editionId}
          contentContainerStyle={styles.list}
          onEndReached={() => { if (hasMore) setPage(p => p + 1) }}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={
            <Text style={[styles.resultCount, { color: colors.textSecondary }]}>
              {grouped.length} {grouped.length === 1 ? 'book' : 'books'} · {results.length} {results.length === 1 ? 'match' : 'matches'}
            </Text>
          }
        />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Recent Searches */}
          {showRecent && (
            <View style={styles.recentSection}>
              <View style={styles.recentHeader}>
                <Text style={[styles.recentTitle, { color: colors.text }]}>{t('search.recentSearches')}</Text>
                <TouchableOpacity onPress={clearRecent}>
                  <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.primary }}>{t('search.clearAll')}</Text>
                </TouchableOpacity>
              </View>
              {recentSearches.map((q, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.recentRow, { borderBottomColor: colors.border }]}
                  onPress={() => { setQuery(q); doSearch(q) }}
                >
                  <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
                  <Text style={[styles.recentText, { color: colors.text }]}>{q}</Text>
                  <TouchableOpacity onPress={() => removeRecent(q)} hitSlop={8}>
                    <Ionicons name="close" size={16} color={colors.textSecondary} />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Catalog Stats Bar */}
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

          {/* Recent Books */}
          {catalogLoading ? (
            <BookGridSkeleton count={6} />
          ) : books.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('home.recentBooks.title')}</Text>
                <TouchableOpacity onPress={() => router.push('/books')} activeOpacity={0.7}>
                  <View style={styles.viewAllRow}>
                    <Text style={[styles.viewAllText, { color: colors.primary }]}>{t('home.recentBooks.viewAll')}</Text>
                    <Ionicons name="arrow-forward" size={16} color={colors.primary} />
                  </View>
                </TouchableOpacity>
              </View>
              <View style={styles.booksGrid}>
                {books.map((book, index) => (
                  <BookCard
                    key={book.id}
                    title={book.title}
                    author={book.authors.map(a => a.name).join(', ')}
                    coverUrl={getStorageUrl(book.coverPath)}
                    onPress={() => router.push(`/book/${book.slug}`)}
                    animationDelay={index * 80}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {/* Authors */}
          {authors.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('home.recentAuthors.title')}</Text>
                <TouchableOpacity onPress={() => router.push('/authors')} activeOpacity={0.7}>
                  <View style={styles.viewAllRow}>
                    <Text style={[styles.viewAllText, { color: colors.primary }]}>{t('home.recentAuthors.viewAll')}</Text>
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
                scrollEnabled
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
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  searchBar: { padding: 12 },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    gap: 8,
  },
  input: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 15,
    padding: 0,
  },
  list: { paddingHorizontal: 12, paddingBottom: 20 },
  skeletonList: { paddingHorizontal: 12 },
  resultCard: {
    flexDirection: 'row',
    padding: 12,
    marginBottom: 8,
    borderRadius: 10,
  },
  cover: { width: 50, height: 70, borderRadius: 4 },
  info: { flex: 1, marginLeft: 12, justifyContent: 'center' },
  title: { fontFamily: fonts.sansMedium, fontSize: 15 },
  chapter: { fontFamily: fonts.sans, fontSize: 13, marginTop: 2 },
  highlight: { fontFamily: fonts.sans, fontSize: 12, marginTop: 4, fontStyle: 'italic' },
  emptyText: { fontFamily: fonts.sans, fontSize: 15, textAlign: 'center' },
  resultCount: { fontFamily: fonts.sans, fontSize: 12, marginBottom: 8 },
  moreBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  subMatch: { paddingTop: 8, marginTop: 8, borderTopWidth: 1 },

  // Recent searches
  recentSection: { paddingHorizontal: 16, marginBottom: 16 },
  recentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  recentTitle: { fontFamily: fonts.sansMedium, fontSize: 16 },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  recentText: { fontFamily: fonts.sans, fontSize: 14, flex: 1 },

  // Catalog stats bar
  statsBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  statItem: { fontFamily: fonts.sansMedium, fontSize: 13 },
  statDot: { fontSize: 16 },

  // Sections
  section: { marginTop: 16 },
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
})
