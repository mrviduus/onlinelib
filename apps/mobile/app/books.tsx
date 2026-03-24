import { useEffect, useState, useCallback } from 'react'
import { View, Text, FlatList, StyleSheet, TouchableOpacity, TextInput } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { createBooksApi, getStorageUrl } from '@textstack/shared'
import type { Edition } from '@textstack/shared'
import { useTheme } from '../src/context/ThemeContext'
import { fonts } from '../src/theme/typography'
import { BookCard } from '../src/components/ui/BookCard'

const LANG = 'en'
const PAGE_SIZE = 20

export default function BooksScreen() {
  const router = useRouter()
  const { colors } = useTheme()

  const [books, setBooks] = useState<Edition[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [query, setQuery] = useState('')

  const fetchBooks = useCallback(async (reset = true) => {
    const api = createBooksApi(LANG)
    const offset = reset ? 0 : books.length
    if (reset) setLoading(true)
    else setLoadingMore(true)
    try {
      const res = await api.getBooks({
        limit: PAGE_SIZE,
        offset,
        search: query || undefined,
      })
      setBooks(prev => reset ? res.items : [...prev, ...res.items])
      setTotal(res.total)
    } catch (e) {
      console.error('Failed to fetch books:', e)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [query, books.length])

  useEffect(() => { fetchBooks(true) }, [query])

  const loadMore = () => {
    if (!loadingMore && books.length < total) fetchBooks(false)
  }

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

      {/* Search */}
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
      </View>

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
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              {query ? 'No books found' : 'No books yet'}
            </Text>
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
  grid: { padding: 16 },
  gridRow: { justifyContent: 'space-between' },
  empty: { fontFamily: fonts.sans, fontSize: 15, textAlign: 'center', marginTop: 40 },
  loadingMore: { fontFamily: fonts.sans, fontSize: 13, textAlign: 'center', padding: 16 },
})
