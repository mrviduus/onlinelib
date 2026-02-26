import { useEffect, useState, useCallback } from 'react'
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { createBooksApi, getStorageUrl } from '@textstack/shared'
import type { Edition } from '@textstack/shared'
import { colors } from '../../src/theme/colors'

const LANG = 'en'
const PAGE_SIZE = 20

export default function HomeScreen() {
  const router = useRouter()
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

  useEffect(() => {
    fetchBooks()
  }, [])

  const onRefresh = () => {
    setRefreshing(true)
    fetchBooks(0, true)
  }

  const onEndReached = () => {
    if (books.length < total) {
      fetchBooks(books.length)
    }
  }

  const renderBook = ({ item }: { item: Edition }) => (
    <TouchableOpacity
      style={styles.bookCard}
      onPress={() => router.push(`/book/${item.slug}`)}
      activeOpacity={0.7}
    >
      <Image
        source={getStorageUrl(item.coverPath)}
        style={styles.cover}
        contentFit="cover"
        placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
      />
      <View style={styles.bookInfo}>
        <Text style={styles.bookTitle} numberOfLines={2}>{item.title}</Text>
        {item.authors.length > 0 && (
          <Text style={styles.bookAuthor} numberOfLines={1}>
            {item.authors.map(a => a.name).join(', ')}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  )

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <FlatList
      data={books}
      renderItem={renderBook}
      keyExtractor={item => item.id}
      numColumns={2}
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.list}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    />
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 12 },
  row: { justifyContent: 'space-between' },
  bookCard: {
    width: '48%',
    marginBottom: 16,
    backgroundColor: colors.surface,
    borderRadius: 8,
    overflow: 'hidden',
  },
  cover: {
    width: '100%',
    aspectRatio: 2 / 3,
    backgroundColor: colors.border,
  },
  bookInfo: { padding: 8 },
  bookTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  bookAuthor: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
})
