import { useState, useCallback } from 'react'
import { View, Text, TextInput, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { createBooksApi, getStorageUrl } from '@textstack/shared'
import type { SearchResult } from '@textstack/shared'
import { colors } from '../../src/theme/colors'

const LANG = 'en'

export default function SearchScreen() {
  const router = useRouter()
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
      style={styles.resultCard}
      onPress={() => router.push(`/book/${item.edition.slug}`)}
      activeOpacity={0.7}
    >
      <Image
        source={getStorageUrl(item.edition.coverPath)}
        style={styles.cover}
        contentFit="cover"
      />
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>{item.edition.title}</Text>
        <Text style={styles.chapter} numberOfLines={1}>
          Ch. {item.chapterNumber}: {item.chapterTitle}
        </Text>
        {item.highlights && item.highlights.length > 0 && (
          <Text style={styles.highlight} numberOfLines={2}>
            {item.highlights[0].replace(/<[^>]+>/g, '')}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  )

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Search books..."
          placeholderTextColor={colors.textSecondary}
          returnKeyType="search"
          onSubmitEditing={search}
        />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : results.length === 0 && searched ? (
        <View style={styles.center}>
          <Text style={styles.empty}>No results found</Text>
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
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  searchBar: { padding: 12 },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  list: { paddingHorizontal: 12 },
  resultCard: {
    flexDirection: 'row',
    padding: 12,
    marginBottom: 8,
    backgroundColor: colors.surface,
    borderRadius: 8,
  },
  cover: { width: 50, height: 70, borderRadius: 4, backgroundColor: colors.border },
  info: { flex: 1, marginLeft: 12, justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '600', color: colors.text },
  chapter: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  highlight: { fontSize: 12, color: colors.textSecondary, marginTop: 4, fontStyle: 'italic' },
  empty: { fontSize: 16, color: colors.textSecondary },
})
