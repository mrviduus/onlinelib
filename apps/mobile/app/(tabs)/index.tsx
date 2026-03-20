import { useEffect, useState, useCallback } from 'react'
import { View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl, TextInput, SafeAreaView } from 'react-native'
import { useRouter } from 'expo-router'
import { createBooksApi, getStorageUrl } from '@textstack/shared'
import type { Edition } from '@textstack/shared'
import { useTheme } from '../../src/context/ThemeContext'
import { typography, fonts } from '../../src/theme/typography'
import { BookCard } from '../../src/components/ui/BookCard'
import { BookGridSkeleton } from '../../src/components/ui/SkeletonLoader'
import { Ionicons } from '@expo/vector-icons'

const LANG = 'en'
const PAGE_SIZE = 20

export default function HomeScreen() {
  const router = useRouter()
  const { colors } = useTheme()
  const [books, setBooks] = useState<Edition[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [total, setTotal] = useState(0)

  const api = createBooksApi(LANG)

  const fetchBooks = useCallback(async (offset = 0, refresh = false) => {
    try {
      const { items, total: t } = await api.getBooks({ limit: PAGE_SIZE, offset })
      setBooks(prev => refresh ? items : [...prev, ...items])
      setTotal(t)
    } catch (e) {
      console.error('Failed to fetch books:', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { fetchBooks() }, [])

  const onRefresh = () => {
    setRefreshing(true)
    fetchBooks(0, true)
  }

  const onEndReached = () => {
    if (books.length < total) fetchBooks(books.length)
  }

  const renderBook = ({ item }: { item: Edition }) => (
    <BookCard
      title={item.title}
      author={item.authors.map(a => a.name).join(', ')}
      coverUrl={getStorageUrl(item.coverPath)}
      onPress={() => router.push(`/book/${item.slug}`)}
    />
  )

  const header = (
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgWarm }]}>
      {loading ? (
        <View>
          {header}
          <BookGridSkeleton count={6} />
        </View>
      ) : (
        <FlatList
          data={books}
          renderItem={renderBook}
          keyExtractor={item => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          ListHeaderComponent={header}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        />
      )}
    </SafeAreaView>
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
  list: { paddingHorizontal: 16, paddingBottom: 20 },
  row: { justifyContent: 'space-between' },
})
