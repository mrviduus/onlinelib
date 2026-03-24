import { useEffect, useState, useCallback, useRef } from 'react'
import { View, Text, FlatList, StyleSheet, TouchableOpacity, TextInput, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { createBooksApi, getStorageUrl } from '@textstack/shared'
import type { Edition, Genre } from '@textstack/shared'
import { useTheme } from '../src/context/ThemeContext'
import { fonts } from '../src/theme/typography'
import { BookCard } from '../src/components/ui/BookCard'

const LANG = 'en'
const PAGE_SIZE = 20
const SORT_OPTIONS = [
  { key: '', label: 'Recent' },
  { key: 'title', label: 'Title' },
  { key: 'oldest', label: 'Oldest' },
] as const

export default function BooksScreen() {
  const router = useRouter()
  const { colors } = useTheme()

  const [books, setBooks] = useState<Edition[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('')
  const [genre, setGenre] = useState('')
  const [genres, setGenres] = useState<Genre[]>([])
  const lastFetchRef = useRef(0)

  useEffect(() => {
    createBooksApi(LANG).getGenres()
      .then(res => setGenres(res.items))
      .catch(() => {})
  }, [])

  const fetchBooks = useCallback(async (reset = true) => {
    const api = createBooksApi(LANG)
    const offset = reset ? 0 : books.length
    if (reset) setLoading(true)
    else setLoadingMore(true)
    const id = ++lastFetchRef.current
    try {
      const res = await api.getBooks({
        limit: PAGE_SIZE,
        offset,
        search: query || undefined,
        genre: genre || undefined,
        sort: sort || undefined,
      })
      if (id !== lastFetchRef.current) return
      setBooks(prev => reset ? res.items : [...prev, ...res.items])
      setTotal(res.total)
    } catch (e) {
      console.error('Failed to fetch books:', e)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [query, sort, genre, books.length])

  useEffect(() => { fetchBooks(true) }, [query, sort, genre])

  const loadMore = () => {
    if (!loadingMore && books.length < total) fetchBooks(false)
  }

  const hasFilters = !!(query || genre || sort)

  return (
    <View style={[styles.container, { backgroundColor: colors.bgWarm }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Books</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Search + Sort */}
      <View style={styles.controls}>
        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search books..."
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
          {SORT_OPTIONS.map(s => (
            <TouchableOpacity
              key={s.key}
              onPress={() => setSort(s.key)}
              style={[styles.sortChip, { backgroundColor: sort === s.key ? colors.primary + '18' : colors.surface, borderColor: sort === s.key ? colors.primary : colors.border }]}
            >
              <Text style={[styles.sortChipText, { color: sort === s.key ? colors.primary : colors.textSecondary }]}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Genre chips */}
      {genres.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.genreRow}>
          <TouchableOpacity
            onPress={() => setGenre('')}
            style={[styles.genreChip, { backgroundColor: !genre ? colors.primary : colors.surface, borderColor: !genre ? colors.primary : colors.border }]}
          >
            <Text style={[styles.genreChipText, { color: !genre ? '#fff' : colors.textSecondary }]}>All</Text>
          </TouchableOpacity>
          {genres.map(g => (
            <TouchableOpacity
              key={g.slug}
              onPress={() => setGenre(genre === g.slug ? '' : g.slug)}
              style={[styles.genreChip, { backgroundColor: genre === g.slug ? colors.primary : colors.surface, borderColor: genre === g.slug ? colors.primary : colors.border }]}
            >
              <Text style={[styles.genreChipText, { color: genre === g.slug ? '#fff' : colors.textSecondary }]}>{g.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Books grid */}
      <FlatList
        data={books}
        numColumns={2}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.gridRow}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyBox}>
              <Text style={[styles.empty, { color: colors.textSecondary }]}>
                {hasFilters ? 'No books found' : 'No books yet'}
              </Text>
              {hasFilters && (
                <TouchableOpacity onPress={() => { setQuery(''); setGenre(''); setSort('') }}>
                  <Text style={[styles.clearBtn, { color: colors.primary }]}>Clear filters</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null
        }
        ListFooterComponent={
          loadingMore ? (
            <Text style={[styles.loadingMore, { color: colors.textSecondary }]}>Loading...</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <BookCard
            title={item.title}
            author={item.authors.map(a => a.name).join(', ')}
            coverUrl={getStorageUrl(item.coverPath)}
            onPress={() => router.push(`/book/${item.slug}`)}
          />
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
  controls: { paddingHorizontal: 16, paddingTop: 12 },
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
  sortRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  sortChipText: { fontFamily: fonts.sansMedium, fontSize: 13 },
  genreRow: { paddingHorizontal: 16, paddingVertical: 8, gap: 6 },
  genreChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  genreChipText: { fontFamily: fonts.sansMedium, fontSize: 12 },
  grid: { padding: 16 },
  gridRow: { justifyContent: 'space-between' },
  emptyBox: { alignItems: 'center', marginTop: 40, gap: 12 },
  empty: { fontFamily: fonts.sans, fontSize: 15, textAlign: 'center' },
  clearBtn: { fontFamily: fonts.sansMedium, fontSize: 14 },
  loadingMore: { fontFamily: fonts.sans, fontSize: 13, textAlign: 'center', padding: 16 },
})
