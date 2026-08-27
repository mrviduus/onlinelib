import { useEffect, useState } from 'react'
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
} from 'react-native'
import { useRouter, Stack } from 'expo-router'
import { createBooksApi, isOfflineError } from '@textstack/shared'
import type { Genre } from '@textstack/shared'
import { useTheme } from '../src/context/ThemeContext'
import { useLanguage } from '../src/context/LanguageContext'
import { fonts } from '../src/theme/typography'
import { SkeletonLoader } from '../src/components/ui/SkeletonLoader'
import { EmptyState } from '../src/components/ui/EmptyState'
import { useReconnectCount } from '../src/hooks/useOnline'

export default function GenresScreen() {
  const router = useRouter()
  const { colors } = useTheme()
  const { language } = useLanguage()
  const [genres, setGenres] = useState<Genre[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<'offline' | 'failed' | null>(null)
  const [attempt, setAttempt] = useState(0)
  const reconnects = useReconnectCount()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const api = createBooksApi(language)
    api.getGenres()
      .then(res => {
        if (cancelled) return
        setGenres(Array.isArray(res) ? res : res.items)
        setLoadError(null)
      })
      .catch(e => {
        if (cancelled) return
        console.warn('Failed to fetch genres:', e)
        setLoadError(isOfflineError(e) ? 'offline' : 'failed')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [language, reconnects, attempt])

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
        ) : genres.length === 0 && loadError ? (
          <EmptyState
            icon={loadError === 'offline' ? 'cloud-offline-outline' : 'alert-circle-outline'}
            title={loadError === 'offline' ? "You're offline" : "Couldn't load genres"}
            buttonLabel="Try again"
            onButtonPress={() => { setLoading(true); setAttempt(a => a + 1) }}
          />
        ) : genres.length === 0 ? (
          <EmptyState icon="library-outline" title="No genres found" />
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
