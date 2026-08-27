import { useEffect, useState, useCallback, useRef } from 'react'
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, TextInput,
} from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { createBooksApi, getStorageUrl, isOfflineError } from '@textstack/shared'
import type { Author } from '@textstack/shared'
import { useTheme } from '../src/context/ThemeContext'
import { useReconnectCount } from '../src/hooks/useOnline'
import { useLanguage } from '../src/context/LanguageContext'
import { fonts } from '../src/theme/typography'

const PAGE_SIZE = 20

export default function AuthorsScreen() {
  const router = useRouter()
  const { colors } = useTheme()
  const { language } = useLanguage()

  const [authors, setAuthors] = useState<Author[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<'offline' | 'failed' | null>(null)
  const [attempt, setAttempt] = useState(0)
  const reconnects = useReconnectCount()
  const [loadingMore, setLoadingMore] = useState(false)
  const [query, setQuery] = useState('')
  const [queryDebounced, setQueryDebounced] = useState('')
  const [sort, setSort] = useState<'' | 'recent'>('')
  const lastFetchRef = useRef(0)

  // Debounce search input — same 300ms as books/highlights/search so
  // each keystroke doesn't fire its own request, and stale responses
  // can't overwrite fresh ones while the user is still typing.
  useEffect(() => {
    const h = setTimeout(() => setQueryDebounced(query), 300)
    return () => clearTimeout(h)
  }, [query])

  const fetchAuthors = useCallback(async (reset = true) => {
    const api = createBooksApi(language)
    const offset = reset ? 0 : authors.length
    if (reset) setLoading(true)
    else setLoadingMore(true)
    const id = ++lastFetchRef.current
    try {
      const res = await api.getAuthors({
        limit: PAGE_SIZE,
        offset,
        sort: sort || undefined,
        search: queryDebounced || undefined,
      })
      if (id !== lastFetchRef.current) return
      setLoadError(null)
      setAuthors(prev => reset ? res.items : [...prev, ...res.items])
      setTotal(res.total)
    } catch (e) {
      if (id === lastFetchRef.current) {
        console.warn('Failed to fetch authors:', e)
        setLoadError(isOfflineError(e) ? 'offline' : 'failed')
      }
    } finally {
      if (id === lastFetchRef.current) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [queryDebounced, sort, authors.length, language])

  useEffect(() => { fetchAuthors(true) }, [queryDebounced, sort, language, reconnects, attempt])

  const loadMore = () => {
    if (!loadingMore && authors.length < total) fetchAuthors(false)
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bgWarm }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Authors</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Search + Sort */}
      <View style={styles.controls}>
        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search authors..."
            placeholderTextColor={colors.textSecondary}
            value={query}
            onChangeText={setQuery}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.sortRow}>
          <TouchableOpacity
            style={[styles.sortBtn, sort === '' && { backgroundColor: colors.primary }]}
            onPress={() => setSort('')}
          >
            <Text style={[styles.sortText, { color: sort === '' ? '#fff' : colors.textSecondary }]}>Name</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sortBtn, sort === 'recent' && { backgroundColor: colors.primary }]}
            onPress={() => setSort('recent')}
          >
            <Text style={[styles.sortText, { color: sort === 'recent' ? '#fff' : colors.textSecondary }]}>Recent</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Author list */}
      <FlatList
        data={authors}
        numColumns={3}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.gridRow}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          loading ? null : loadError ? (
            <View>
              <Text style={[styles.empty, { color: colors.textSecondary }]}>
                {loadError === 'offline'
                  ? "You're offline — authors need a connection."
                  : "Couldn't load authors."}
              </Text>
              <TouchableOpacity onPress={() => { setLoading(true); setAttempt(a => a + 1) }}>
                <Text style={[styles.empty, { color: colors.primary }]}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              {query ? 'No authors found' : 'No authors yet'}
            </Text>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <Text style={[styles.loadingMore, { color: colors.textSecondary }]}>Loading...</Text>
          ) : null
        }
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
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 54,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontFamily: fonts.serifBold, fontSize: 20 },
  controls: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: { flex: 1, fontFamily: fonts.sans, fontSize: 15, padding: 0 },
  sortRow: { flexDirection: 'row', gap: 8 },
  sortBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16 },
  sortText: { fontFamily: fonts.sansMedium, fontSize: 13 },
  grid: { padding: 16 },
  gridRow: { justifyContent: 'flex-start', gap: 16 },
  authorCard: { alignItems: 'center', width: '30%', marginBottom: 20 },
  authorPhoto: { width: 72, height: 72, borderRadius: 36, marginBottom: 6 },
  authorPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  authorInitial: { fontFamily: fonts.serif, fontSize: 28 },
  authorName: { fontFamily: fonts.sans, fontSize: 12, textAlign: 'center' },
  empty: { fontFamily: fonts.sans, fontSize: 15, textAlign: 'center', marginTop: 40 },
  loadingMore: { fontFamily: fonts.sans, fontSize: 13, textAlign: 'center', padding: 16 },
})
