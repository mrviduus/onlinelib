import { useEffect, useState, useCallback } from 'react'
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native'
import { Image } from 'expo-image'
import { useRouter, Stack } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { blogApi, getStorageUrl } from '@textstack/shared'
import type { BlogPostListItemDto } from '@textstack/shared/api/blog'
import { useTheme } from '../../src/context/ThemeContext'
import { fonts } from '../../src/theme/typography'

const PAGE_SIZE = 10

export default function BlogScreen() {
  const router = useRouter()
  const { colors } = useTheme()
  const [posts, setPosts] = useState<BlogPostListItemDto[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  const fetchPosts = useCallback(async (offset = 0) => {
    try {
      const res = await blogApi.getBlogPosts({ language: 'en', limit: PAGE_SIZE, offset })
      if (offset === 0) {
        setPosts(res.items)
      } else {
        setPosts(prev => [...prev, ...res.items])
      }
      setTotal(res.total)
    } catch (e) {
      console.error('Failed to load blog posts:', e)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchPosts() }, [])

  const renderPost = ({ item }: { item: BlogPostListItemDto }) => {
    const date = item.publishedAt ? new Date(item.publishedAt).toLocaleDateString() : ''
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => router.push(`/blog/${item.slug}`)}
        activeOpacity={0.85}
      >
        {item.coverImagePath && (
          <Image source={getStorageUrl(item.coverImagePath)} style={styles.coverImage} contentFit="cover" />
        )}
        <View style={styles.cardContent}>
          <Text style={[styles.postTitle, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
          {item.excerpt && (
            <Text style={[styles.excerpt, { color: colors.textSecondary }]} numberOfLines={3}>{item.excerpt}</Text>
          )}
          <View style={styles.metaRow}>
            <Text style={[styles.metaText, { color: colors.textSecondary }]}>{item.authorName}</Text>
            {date && <Text style={[styles.metaText, { color: colors.textSecondary }]}>{date}</Text>}
          </View>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Ionicons name="heart-outline" size={14} color={colors.textSecondary} />
              <Text style={[styles.statText, { color: colors.textSecondary }]}>{item.likeCount}</Text>
            </View>
            <View style={styles.stat}>
              <Ionicons name="chatbubble-outline" size={14} color={colors.textSecondary} />
              <Text style={[styles.statText, { color: colors.textSecondary }]}>{item.commentCount}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <>
      <Stack.Screen options={{
        title: 'Blog',
        headerShown: true,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: fonts.sansMedium, fontSize: 16 },
        headerShadowVisible: false,
      }} />
      <FlatList
        data={posts}
        renderItem={renderPost}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.list, { backgroundColor: colors.background }]}
        style={{ backgroundColor: colors.background }}
        onEndReached={() => { if (posts.length < total) fetchPosts(posts.length) }}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          loading ? <ActivityIndicator style={{ padding: 40 }} color={colors.primary} /> :
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No blog posts yet</Text>
        }
      />
    </>
  )
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 16 },
  card: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  coverImage: { width: '100%', height: 180 },
  cardContent: { padding: 16 },
  postTitle: { fontFamily: fonts.serifBold, fontSize: 18, lineHeight: 24, marginBottom: 6 },
  excerpt: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20, marginBottom: 10 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  metaText: { fontFamily: fonts.sans, fontSize: 12 },
  statsRow: { flexDirection: 'row', gap: 16 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontFamily: fonts.sans, fontSize: 12 },
  emptyText: { fontFamily: fonts.sans, fontSize: 14, textAlign: 'center', paddingVertical: 40 },
})
