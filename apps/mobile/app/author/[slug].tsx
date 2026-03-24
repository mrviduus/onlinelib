import { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, FlatList, Share, TouchableOpacity } from 'react-native'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { createBooksApi, getStorageUrl } from '@textstack/shared'
import type { AuthorDetail } from '@textstack/shared'
import { useTheme } from '../../src/context/ThemeContext'
import { fonts } from '../../src/theme/typography'
import { BookCard } from '../../src/components/ui/BookCard'
import { SkeletonLoader } from '../../src/components/ui/SkeletonLoader'

const LANG = 'en'

export default function AuthorScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const router = useRouter()
  const { colors } = useTheme()
  const [author, setAuthor] = useState<AuthorDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    const api = createBooksApi(LANG)
    api.getAuthor(slug)
      .then(setAuthor)
      .catch(e => console.error('Failed to load author:', e))
      .finally(() => setLoading(false))
  }, [slug])

  if (loading || !author) {
    return (
      <>
        <Stack.Screen options={{ title: '', headerShown: true, headerStyle: { backgroundColor: colors.background }, headerShadowVisible: false }} />
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <View style={styles.heroCenter}>
            <SkeletonLoader width={120} height={120} borderRadius={60} />
            <SkeletonLoader width="50%" height={24} style={{ marginTop: 16 }} />
            <SkeletonLoader width="30%" height={16} style={{ marginTop: 8 }} />
          </View>
        </View>
      </>
    )
  }

  return (
    <>
      <Stack.Screen options={{
        title: author.name,
        headerShown: true,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: fonts.sansMedium, fontSize: 16 },
        headerShadowVisible: false,
      }} />
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Hero */}
        <View style={styles.heroCenter}>
          {author.photoPath ? (
            <Image source={getStorageUrl(author.photoPath)} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: colors.primaryLight }]}>
              <Text style={[styles.avatarLetter, { color: colors.primary }]}>
                {author.name.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={[styles.name, { color: colors.text }]}>{author.name}</Text>
          <View style={styles.metaRow}>
            <Ionicons name="book-outline" size={14} color={colors.textSecondary} />
            <Text style={[styles.metaText, { color: colors.textSecondary }]}>
              {author.bookCount} {author.bookCount === 1 ? 'book' : 'books'}
            </Text>
          </View>
        </View>

        {author.bio && (
          <Text style={[styles.bio, { color: colors.text }]}>{author.bio}</Text>
        )}

        <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 10 }}
            onPress={() => Share.share({ message: `${author.name} — Read on TextStack: https://textstack.app/en/authors/${slug}` }).catch(() => {})}
          >
            <Ionicons name="share-outline" size={18} color={colors.text} />
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: 14, color: colors.text }}>Share</Text>
          </TouchableOpacity>
        </View>

        {author.editions.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Books</Text>
            <View style={styles.booksGrid}>
              {author.editions.map(ed => (
                <BookCard
                  key={ed.id}
                  title={ed.title}
                  author={author.name}
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
  heroCenter: { alignItems: 'center', paddingTop: 16, paddingBottom: 20, paddingHorizontal: 16 },
  avatar: { width: 120, height: 120, borderRadius: 60 },
  avatarPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  avatarLetter: { fontFamily: fonts.serif, fontSize: 48 },
  name: { fontFamily: fonts.serifBold, fontSize: 24, textAlign: 'center', marginTop: 16 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  metaText: { fontFamily: fonts.sans, fontSize: 13 },
  bio: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 22, paddingHorizontal: 16, marginBottom: 20 },
  sectionTitle: { fontFamily: fonts.serifBold, fontSize: 20, paddingHorizontal: 16, marginBottom: 12 },
  booksGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, justifyContent: 'space-between' },
})
