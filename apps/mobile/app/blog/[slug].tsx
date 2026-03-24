import { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Share } from 'react-native'
import { Image } from 'expo-image'
import { useLocalSearchParams, Stack } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { blogApi, getStorageUrl } from '@textstack/shared'
import type { BlogPostDetailDto, BlogCommentDto } from '@textstack/shared/api/blog'
import { useAuth } from '../../src/context/AuthContext'
import { useTheme } from '../../src/context/ThemeContext'
import { useLanguage } from '../../src/context/LanguageContext'
import { fonts } from '../../src/theme/typography'

export default function BlogPostScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const { isAuthenticated } = useAuth()
  const { colors } = useTheme()
  const { language } = useLanguage()
  const [post, setPost] = useState<BlogPostDetailDto | null>(null)
  const [comments, setComments] = useState<BlogCommentDto[]>([])
  const [loading, setLoading] = useState(true)
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [commentText, setCommentText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!slug) return
    Promise.all([
      blogApi.getBlogPost(slug, language),
    ]).then(([p]) => {
      setPost(p)
      setLiked(p.isLikedByMe)
      setLikeCount(p.likeCount)
      return blogApi.getBlogPostComments(p.id)
    }).then(c => {
      setComments(c.items)
    }).catch(e => console.error('Failed to load blog post:', e))
      .finally(() => setLoading(false))
  }, [slug, language])

  const handleLike = async () => {
    if (!post) return
    try {
      if (liked) {
        const res = await blogApi.unlikeBlogPost(post.id)
        setLiked(false)
        setLikeCount(res.likeCount)
      } else {
        const res = await blogApi.likeBlogPost(post.id)
        setLiked(true)
        setLikeCount(res.likeCount)
      }
    } catch {}
  }

  const handleComment = async () => {
    if (!post || !commentText.trim()) return
    setSubmitting(true)
    try {
      const c = await blogApi.addBlogComment(post.id, commentText.trim())
      setComments(prev => [c, ...prev])
      setCommentText('')
    } catch {}
    setSubmitting(false)
  }

  if (loading || !post) {
    return (
      <>
        <Stack.Screen options={{ title: '', headerShown: true, headerStyle: { backgroundColor: colors.background }, headerShadowVisible: false }} />
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      </>
    )
  }

  const date = post.publishedAt ? new Date(post.publishedAt).toLocaleDateString() : ''

  return (
    <>
      <Stack.Screen options={{
        title: post.title,
        headerShown: true,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: fonts.sansMedium, fontSize: 16 },
        headerShadowVisible: false,
      }} />
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
        {post.coverImagePath && (
          <Image source={getStorageUrl(post.coverImagePath)} style={styles.coverImage} contentFit="cover" />
        )}
        <View style={styles.content}>
          <Text style={[styles.title, { color: colors.text }]}>{post.title}</Text>
          <View style={styles.metaRow}>
            <Text style={[styles.metaText, { color: colors.textSecondary }]}>{post.authorName}</Text>
            {date && <Text style={[styles.metaText, { color: colors.textSecondary }]}>{date}</Text>}
          </View>

          {/* Tags */}
          {post.tags && (
            <View style={styles.tagsRow}>
              {post.tags.split(',').map((tag, i) => (
                <View key={i} style={[styles.tag, { backgroundColor: colors.primaryLight }]}>
                  <Text style={[styles.tagText, { color: colors.primary }]}>{tag.trim()}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Body — render as plain text for now (HTML rendering would need a WebView) */}
          <Text style={[styles.body, { color: colors.text }]}>
            {post.content.replace(/<[^>]*>/g, '')}
          </Text>

          {/* Like + Share */}
          <View style={styles.likeRow}>
            <TouchableOpacity
              style={[styles.likeButton, { borderColor: liked ? colors.primary : colors.border }]}
              onPress={handleLike}
              disabled={!isAuthenticated}
              activeOpacity={0.7}
            >
              <Ionicons name={liked ? 'heart' : 'heart-outline'} size={18} color={liked ? colors.primary : colors.textSecondary} />
              <Text style={[styles.likeText, { color: liked ? colors.primary : colors.textSecondary }]}>{likeCount}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.likeButton, { borderColor: colors.border }]}
              onPress={() => Share.share({ message: `${post.title} — Read on TextStack: https://textstack.app/en/blog/${slug}` }).catch(() => {})}
              activeOpacity={0.7}
            >
              <Ionicons name="share-outline" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Comments */}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Comments ({comments.length})
          </Text>

          {isAuthenticated && (
            <View style={[styles.commentInput, { borderColor: colors.border }]}>
              <TextInput
                style={[styles.commentField, { color: colors.text }]}
                value={commentText}
                onChangeText={setCommentText}
                placeholder="Write a comment..."
                placeholderTextColor={colors.textSecondary}
                multiline
              />
              <TouchableOpacity onPress={handleComment} disabled={submitting || !commentText.trim()} activeOpacity={0.7}>
                <Ionicons name="send" size={20} color={commentText.trim() ? colors.primary : colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}

          {comments.map(c => (
            <View key={c.id} style={[styles.commentCard, { borderColor: colors.border }]}>
              <View style={styles.commentHeader}>
                {c.userPicture ? (
                  <Image source={{ uri: c.userPicture }} style={styles.commentAvatar} />
                ) : (
                  <View style={[styles.commentAvatar, { backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: colors.primary }}>
                      {(c.userName || 'A').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <Text style={[styles.commentUser, { color: colors.text }]}>{c.userName || 'Anonymous'}</Text>
                <Text style={[styles.commentDate, { color: colors.textSecondary }]}>
                  {new Date(c.createdAt).toLocaleDateString()}
                </Text>
              </View>
              <Text style={[styles.commentText, { color: colors.text }]}>{c.text}</Text>

              {/* Replies */}
              {c.replies?.map(r => (
                <View key={r.id} style={[styles.replyCard, { borderColor: colors.border }]}>
                  <View style={styles.commentHeader}>
                    <Text style={[styles.commentUser, { color: colors.text }]}>{r.userName || 'Anonymous'}</Text>
                    <Text style={[styles.commentDate, { color: colors.textSecondary }]}>
                      {new Date(r.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <Text style={[styles.commentText, { color: colors.text }]}>{r.text}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  coverImage: { width: '100%', height: 200 },
  content: { padding: 16 },
  title: { fontFamily: fonts.serifBold, fontSize: 24, lineHeight: 30, marginBottom: 8 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  metaText: { fontFamily: fonts.sans, fontSize: 13 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  tagText: { fontFamily: fonts.sansMedium, fontSize: 12 },
  body: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 24, marginBottom: 20 },
  likeRow: { marginBottom: 24 },
  likeButton: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  likeText: { fontFamily: fonts.sansMedium, fontSize: 14 },
  sectionTitle: { fontFamily: fonts.serifBold, fontSize: 20, marginBottom: 12 },
  commentInput: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 16 },
  commentField: { flex: 1, fontFamily: fonts.sans, fontSize: 14, maxHeight: 100 },
  commentCard: { borderBottomWidth: 1, paddingVertical: 12 },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  commentAvatar: { width: 28, height: 28, borderRadius: 14 },
  commentUser: { fontFamily: fonts.sansMedium, fontSize: 13, flex: 1 },
  commentDate: { fontFamily: fonts.sans, fontSize: 11 },
  commentText: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
  replyCard: { marginLeft: 28, paddingTop: 10, borderLeftWidth: 2, paddingLeft: 12, marginTop: 8 },
})
