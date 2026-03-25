import { useState, useCallback, useEffect, useRef } from 'react'
import { View, Text, TextInput, FlatList, StyleSheet, TouchableOpacity } from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createBooksApi, getStorageUrl } from '@textstack/shared'
import type { SearchResult } from '@textstack/shared'
import { useTheme } from '../../src/context/ThemeContext'
import { useLanguage } from '../../src/context/LanguageContext'
import { fonts } from '../../src/theme/typography'
import { SkeletonLoader } from '../../src/components/ui/SkeletonLoader'

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
        // Strip any remaining tags
        return part.replace(/<[^>]+>/g, '')
      })}
    </Text>
  )
}

const RECENT_KEY = 'textstack_recent_searches'
const MAX_RECENT = 8
const RESULTS_PER_PAGE = 10

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

export default function SearchScreen() {
  const router = useRouter()
  const { colors } = useTheme()
  const { language } = useLanguage()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const [expandedEditions, setExpandedEditions] = useState<Set<string>>(new Set())
  const inputRef = useRef<TextInput>(null)

  const debouncedQuery = useDebounce(query.trim(), 300)

  // Load recent searches
  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY).then(v => {
      if (v) try { setRecentSearches(JSON.parse(v)) } catch {}
    })
  }, [])

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
                {isExpanded ? 'Hide' : `+${item.otherMatches.length} more match${item.otherMatches.length > 1 ? 'es' : ''}`}
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

  // Show recent searches when no query
  const showRecent = !searched && !loading && query.length === 0 && recentSearches.length > 0

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
            placeholder="Search books..."
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
      ) : showRecent ? (
        <View style={styles.recentSection}>
          <View style={styles.recentHeader}>
            <Text style={[styles.recentTitle, { color: colors.text }]}>Recent Searches</Text>
            <TouchableOpacity onPress={clearRecent}>
              <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.primary }}>Clear</Text>
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
      ) : results.length === 0 && searched ? (
        <View style={styles.center}>
          <Ionicons name="search-outline" size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No results for "{query}"</Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>Try a different search term</Text>
        </View>
      ) : !searched ? (
        <View style={styles.center}>
          <Ionicons name="book-outline" size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Search across all books</Text>
        </View>
      ) : (
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
  emptySubtext: { fontFamily: fonts.sans, fontSize: 13, textAlign: 'center' },
  resultCount: { fontFamily: fonts.sans, fontSize: 12, marginBottom: 8 },
  moreBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  subMatch: { paddingTop: 8, marginTop: 8, borderTopWidth: 1 },
  recentSection: { paddingHorizontal: 16 },
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
})
