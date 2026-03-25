import { useEffect, useState } from 'react'
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
} from 'react-native'
import { useRouter, Stack } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { createBooksApi } from '@textstack/shared'
import type { Genre } from '@textstack/shared'
import { useTheme } from '../src/context/ThemeContext'
import { useLanguage } from '../src/context/LanguageContext'
import { fonts } from '../src/theme/typography'
import { SkeletonLoader } from '../src/components/ui/SkeletonLoader'

export default function GenresScreen() {
  const router = useRouter()
  const { colors } = useTheme()
  const { language } = useLanguage()
  const [genres, setGenres] = useState<Genre[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const api = createBooksApi(language)
    api.getGenres()
      .then(res => setGenres(Array.isArray(res) ? res : res.items))
      .catch(e => console.error('Failed to fetch genres:', e))
      .finally(() => setLoading(false))
  }, [language])

  return (
    <>
      <Stack.Screen options={{ title: 'Genres', headerShown: true }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {loading ? (
          <View style={styles.grid}>
            {Array.from({ length: 8 }).map((_, i) => (
              <View key={i} style={[styles.card, { backgroundColor: colors.surface }]}>
                <SkeletonLoader width="60%" height={18} />
                <SkeletonLoader width="40%" height={14} style={{ marginTop: 8 }} />
              </View>
            ))}
          </View>
        ) : genres.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="library-outline" size={48} color={colors.textSecondary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No genres found</Text>
          </View>
        ) : (
          <FlatList
            data={genres}
            keyExtractor={item => item.id}
            numColumns={2}
            contentContainerStyle={styles.grid}
            columnWrapperStyle={styles.row}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => router.push(`/genre/${item.slug}`)}
                activeOpacity={0.85}
              >
                <Text style={[styles.genreName, { color: colors.text }]} numberOfLines={2}>{item.name}</Text>
                <Text style={[styles.bookCount, { color: colors.textSecondary }]}>
                  {item.bookCount} {item.bookCount === 1 ? 'book' : 'books'}
                </Text>
                {item.description && (
                  <Text style={[styles.desc, { color: colors.textSecondary }]} numberOfLines={2}>{item.description}</Text>
                )}
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  emptyText: { fontFamily: fonts.sans, fontSize: 15 },
  grid: { padding: 12 },
  row: { gap: 10 },
  card: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  genreName: { fontFamily: fonts.sansMedium, fontSize: 16 },
  bookCount: { fontFamily: fonts.sans, fontSize: 13, marginTop: 4 },
  desc: { fontFamily: fonts.sans, fontSize: 12, marginTop: 6, lineHeight: 18 },
})
