import { useState, useCallback } from 'react'
import { View, Text, TextInput, FlatList, StyleSheet, TouchableOpacity } from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { createBooksApi, getStorageUrl } from '@textstack/shared'
import type { SearchResult } from '@textstack/shared'
import { useTheme } from '../../src/context/ThemeContext'
import { fonts } from '../../src/theme/typography'
import { SkeletonLoader } from '../../src/components/ui/SkeletonLoader'

const LANG = 'en'

export default function SearchScreen() {
  const router = useRouter()
  const { colors } = useTheme()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  const api = createBooksApi(LANG)

  const search = useCallback(async () => {
    if (query.trim().length < 2) return
    setLoading(true)
    setSearched(true)
    try {
      const { items } = await api.search(query.trim(), { limit: 30, highlight: true })
      setResults(items)
    } catch (e) {
      console.error('Search failed:', e)
    } finally {
      setLoading(false)
    }
  }, [query])

  const renderResult = ({ item }: { item: SearchResult }) => (
    <TouchableOpacity
      style={[styles.resultCard, { backgroundColor: colors.surface }]}
      onPress={() => router.push(`/book/${item.edition.slug}`)}
      activeOpacity={0.85}
    >
      <Image
        source={getStorageUrl(item.edition.coverPath)}
        style={[styles.cover, { backgroundColor: colors.border }]}
        contentFit="cover"
      />
      <View style={styles.info}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{item.edition.title}</Text>
        <Text style={[styles.chapter, { color: colors.textSecondary }]} numberOfLines={1}>
          Ch. {item.chapterNumber}: {item.chapterTitle}
        </Text>
        {item.highlights && item.highlights.length > 0 && (
          <Text style={[styles.highlight, { color: colors.textSecondary }]} numberOfLines={2}>
            {item.highlights[0].replace(/<[^>]+>/g, '')}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  )

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.searchBar}>
        <View style={[styles.inputWrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
          <TextInput
            style={[styles.input, { color: colors.text }]}
            value={query}
            onChangeText={setQuery}
            placeholder="Search books..."
            placeholderTextColor={colors.textSecondary}
            returnKeyType="search"
            onSubmitEditing={search}
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
        <View style={styles.center}>
          <Ionicons name="search-outline" size={48} color={colors.border} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No results found</Text>
        </View>
      ) : !searched ? (
        <View style={styles.center}>
          <Ionicons name="book-outline" size={48} color={colors.border} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Search across all books</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          renderItem={renderResult}
          keyExtractor={(item, i) => `${item.chapterId}-${i}`}
          contentContainerStyle={styles.list}
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
  list: { paddingHorizontal: 12 },
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
  emptyText: { fontFamily: fonts.sans, fontSize: 15 },
})
