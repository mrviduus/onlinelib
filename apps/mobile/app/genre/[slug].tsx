import { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet } from 'react-native'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { createBooksApi, getStorageUrl } from '@textstack/shared'
import type { GenreDetail } from '@textstack/shared'
import { useTheme } from '../../src/context/ThemeContext'
import { fonts } from '../../src/theme/typography'
import { BookCard } from '../../src/components/ui/BookCard'
import { SkeletonLoader } from '../../src/components/ui/SkeletonLoader'

const LANG = 'en'

export default function GenreScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const router = useRouter()
  const { colors } = useTheme()
  const [genre, setGenre] = useState<GenreDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    const api = createBooksApi(LANG)
    api.getGenre(slug)
      .then(setGenre)
      .catch(e => console.error('Failed to load genre:', e))
      .finally(() => setLoading(false))
  }, [slug])

  if (loading || !genre) {
    return (
      <>
        <Stack.Screen options={{ title: '', headerShown: true, headerStyle: { backgroundColor: colors.background }, headerShadowVisible: false }} />
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <View style={{ padding: 16, gap: 8 }}>
            <SkeletonLoader width="50%" height={28} />
            <SkeletonLoader width="30%" height={16} />
            <SkeletonLoader width="100%" height={60} style={{ marginTop: 12 }} />
          </View>
        </View>
      </>
    )
  }

  return (
    <>
      <Stack.Screen options={{
        title: genre.name,
        headerShown: true,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: fonts.sansMedium, fontSize: 16 },
        headerShadowVisible: false,
      }} />
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Text style={[styles.name, { color: colors.text }]}>{genre.name}</Text>
          <View style={styles.metaRow}>
            <Ionicons name="library-outline" size={14} color={colors.textSecondary} />
            <Text style={[styles.metaText, { color: colors.textSecondary }]}>
              {genre.bookCount} {genre.bookCount === 1 ? 'book' : 'books'}
            </Text>
          </View>
          {genre.description && (
            <Text style={[styles.description, { color: colors.text }]}>{genre.description}</Text>
          )}
        </View>

        {genre.editions.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Books</Text>
            <View style={styles.booksGrid}>
              {genre.editions.map(ed => (
                <BookCard
                  key={ed.id}
                  title={ed.title}
                  author={ed.authors.map(a => a.name).join(', ')}
                  coverUrl={getStorageUrl(ed.coverPath)}
                  onPress={() => router.push(`/book/${ed.slug}`)}
                />
              ))}
            </View>
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20 },
  name: { fontFamily: fonts.serifBold, fontSize: 28 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  metaText: { fontFamily: fonts.sans, fontSize: 13 },
  description: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 22, marginTop: 12 },
  sectionTitle: { fontFamily: fonts.serifBold, fontSize: 20, paddingHorizontal: 16, marginBottom: 12 },
  booksGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, justifyContent: 'space-between' },
})
