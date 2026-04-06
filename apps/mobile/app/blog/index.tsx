import { useEffect, useState, useCallback, useMemo } from 'react'
import { View, Text, FlatList, ScrollView as HScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native'
import { Image } from 'expo-image'
import { useRouter, Stack } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { blogApi, getStorageUrl } from '@textstack/shared'
import type { BlogPostListItemDto } from '@textstack/shared/api/blog'
import { useTheme } from '../../src/context/ThemeContext'
import { useLanguage } from '../../src/context/LanguageContext'
import { fonts } from '../../src/theme/typography'
import { EmptyState } from '../../src/components/ui/EmptyState'

const PAGE_SIZE = 10

export default function BlogScreen() {
  const router = useRouter()
  const { colors } = useTheme()
  const { language, t } = useLanguage()
  const [posts, setPosts] = useState<BlogPostListItemDto[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [tag, setTag] = useState('')

  const allTags = useMemo(() => {
    const tags = new Set<string>()
    for (const p of posts) {
      if (p.tags) p.tags.split(',').map(t => t.trim()).filter(Boolean).forEach(t => tags.add(t))
    }
    return [...tags]
  }, [posts])

  const fetchPosts = useCallback(async (offset = 0, filterTag = '') => {
    try {
      const res = await blogApi.getBlogPosts({ language, limit: PAGE_SIZE, offset, tag: filterTag || undefined })
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
  }, [language])

  useEffect(() => { fetchPosts() }, [language])

  const handleTagFilter = (newTag: string) => {
    const t = tag === newTag ? '' : newTag
    setTag(t)
    setLoading(true)
    fetchPosts(0, t)
  }

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
          {item.tags && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {item.tags.split(',').map(t => t.trim()).filter(Boolean).map((t, i) => (
                <View key={i} style={[styles.cardTag, { backgroundColor: colors.primaryLight }]}>
                  <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: colors.primary }}>{t}</Text>
                </View>
              ))}
            </View>
          )}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Ionicons name="heart-outline" size={14} color={colors.textSecondary} />
              <Text style={[styles.statText, { color: colors.textSecondary }]}>{item.likeCount}</Text>
            </View>
            <View style={styles.stat}>
              <Ionicons name="chatbubble-outline" size={14} color={colors.textSecondary} />
              <Text style={[styles.statText, { color: colors.textSecondary }]}>{item.commentCount}</Text>
            </View>
            {item.viewCount > 0 && (
              <View style={styles.stat}>
                <Ionicons name="eye-outline" size={14} color={colors.textSecondary} />
                <Text style={[styles.statText, { color: colors.textSecondary }]}>{item.viewCount}</Text>
              </View>
            )}
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
        onEndReached={() => { if (posts.length < total) fetchPosts(posts.length, tag) }}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={allTags.length > 0 ? (
          <HScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <TouchableOpacity
              onPress={() => handleTagFilter('')}
              style={[styles.tagChip, !tag && { backgroundColor: colors.primary }]}
            >
              <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: !tag ? '#fff' : colors.textSecondary }}>All</Text>
            </TouchableOpacity>
            {allTags.map(t => (
              <TouchableOpacity
                key={t}
                onPress={() => handleTagFilter(t)}
                style={[styles.tagChip, tag === t && { backgroundColor: colors.primary }]}
              >
                <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: tag === t ? '#fff' : colors.textSecondary }}>{t}</Text>
              </TouchableOpacity>
            ))}
          </HScrollView>
        ) : null}
        ListEmptyComponent={
          loading ? <ActivityIndicator style={{ padding: 40 }} color={colors.primary} /> :
          <EmptyState icon="newspaper-outline" title={t('blog.empty')} />
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
  tagChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginRight: 6 },
  cardTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
})
