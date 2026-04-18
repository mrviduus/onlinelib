import { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Share, Alert } from 'react-native'
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
  const { isAuthenticated, user } = useAuth()
  const { colors } = useTheme()
  const { language } = useLanguage()
  const [post, setPost] = useState<BlogPostDetailDto | null>(null)
  const [comments, setComments] = useState<BlogCommentDto[]>([])
  const [loading, setLoading] = useState(true)
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [commentText, setCommentText] = useState('')
  const [replyTo, setReplyTo] = useState<{ id: string; userName: string } | null>(null)
  const [replyText, setReplyText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!slug) return
    // Two-step load — post first, comments second — so we can surface the
    // post even if the comments endpoint fails. Both steps honour `cancelled`
    // so fast nav away doesn't setState on an unmounted component.
    let cancelled = false
    setLoading(true)
    blogApi.getBlogPost(slug, language)
      .then(p => {
        if (cancelled) return null
        setPost(p)
        setLiked(p.isLikedByMe)
        setLikeCount(p.likeCount)
        return blogApi.getBlogPostComments(p.id)
      })
      .then(c => {
        if (cancelled || !c) return
        setComments(c.items)
      })
      .catch(e => { if (!cancelled) console.warn('Failed to load blog post:', e) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => {
      cancelled = true
    }
  }, [slug, language])

  const handleLike = async () => {
    if (!post) return
    // Optimistic toggle + rollback. The previous impl just swallowed errors
    // and left the UI frozen on the pre-tap state — which looked like
    // "nothing happened" if the like request 500'd.
    const prevLiked = liked
    const prevCount = likeCount
    setLiked(!prevLiked)
    setLikeCount(prevCount + (prevLiked ? -1 : 1))
    try {
      const res = prevLiked
        ? await blogApi.unlikeBlogPost(post.id)
        : await blogApi.likeBlogPost(post.id)
      setLikeCount(res.likeCount)
    } catch (e) {
      console.warn('Blog like toggle failed:', e)
      setLiked(prevLiked)
      setLikeCount(prevCount)
    }
  }

  const handleComment = async () => {
    if (!post || !commentText.trim() || submitting) return
    setSubmitting(true)
    try {
      const c = await blogApi.addBlogComment(post.id, commentText.trim())
      setComments(prev => [c, ...prev])
      setCommentText('')
    } catch (e) {
      console.warn('Post blog comment failed:', e)
    }
    setSubmitting(false)
  }

  const handleReply = async (parentId: string) => {
    if (!post || !replyText.trim() || submitting) return
    setSubmitting(true)
    try {
      const r = await blogApi.addBlogComment(post.id, replyText.trim(), parentId)
      setComments(prev => prev.map(c =>
        c.id === parentId ? { ...c, replies: [...(c.replies || []), r] } : c
      ))
      setReplyText('')
      setReplyTo(null)
    } catch (e) {
      console.warn('Post blog reply failed:', e)
    }
    setSubmitting(false)
  }

  const handleDeleteComment = async (commentId: string, parentId?: string) => {
    Alert.alert('Delete Comment', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await blogApi.deleteBlogComment(commentId)
            if (parentId) {
              setComments(prev => prev.map(c =>
                c.id === parentId ? { ...c, replies: (c.replies || []).filter(r => r.id !== commentId) } : c
              ))
            } else {
              setComments(prev => prev.filter(c => c.id !== commentId))
            }
          } catch (e) {
            console.warn('Delete blog comment failed:', e)
          }
        },
      },
    ])
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {post.viewCount > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Ionicons name="eye-outline" size={13} color={colors.textSecondary} />
                  <Text style={[styles.metaText, { color: colors.textSecondary }]}>{post.viewCount}</Text>
                </View>
              )}
              {date ? <Text style={[styles.metaText, { color: colors.textSecondary }]}>{date}</Text> : null}
            </View>
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

          {/* Body */}
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
            <CommentItem
              key={c.id}
              comment={c}
              userId={user?.id}
              isAuthenticated={isAuthenticated}
              replyTo={replyTo}
              replyText={replyText}
              submitting={submitting}
              onSetReplyTo={setReplyTo}
              onSetReplyText={setReplyText}
              onReply={handleReply}
              onDelete={handleDeleteComment}
              colors={colors}
            />
          ))}
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </>
  )
}

function CommentItem({
  comment: c, userId, isAuthenticated, replyTo, replyText, submitting,
  onSetReplyTo, onSetReplyText, onReply, onDelete, colors,
}: {
  comment: BlogCommentDto
  userId?: string
  isAuthenticated: boolean
  replyTo: { id: string; userName: string } | null
  replyText: string
  submitting: boolean
  onSetReplyTo: (v: { id: string; userName: string } | null) => void
  onSetReplyText: (v: string) => void
  onReply: (parentId: string) => void
  onDelete: (commentId: string, parentId?: string) => void
  colors: any
}) {
  const isOwner = userId && c.userId === userId

  return (
    <View style={[styles.commentCard, { borderColor: colors.border }]}>
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

      {/* Actions: Reply + Delete */}
      <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
        {isAuthenticated && (
          <TouchableOpacity
            onPress={() => onSetReplyTo(replyTo?.id === c.id ? null : { id: c.id, userName: c.userName || 'Anonymous' })}
            activeOpacity={0.7}
          >
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: colors.primary }}>Reply</Text>
          </TouchableOpacity>
        )}
        {isOwner && (
          <TouchableOpacity onPress={() => onDelete(c.id)} activeOpacity={0.7}>
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: colors.error || '#DC2626' }}>Delete</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Reply form */}
      {replyTo?.id === c.id && (
        <View style={[styles.commentInput, { borderColor: colors.border, marginTop: 10 }]}>
          <TextInput
            style={[styles.commentField, { color: colors.text }]}
            value={replyText}
            onChangeText={onSetReplyText}
            placeholder={`Reply to ${replyTo.userName}...`}
            placeholderTextColor={colors.textSecondary}
            multiline
            autoFocus
          />
          <TouchableOpacity onPress={() => onReply(c.id)} disabled={submitting || !replyText.trim()} activeOpacity={0.7}>
            <Ionicons name="send" size={18} color={replyText.trim() ? colors.primary : colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Replies */}
      {c.replies?.map(r => {
        const replyIsOwner = userId && r.userId === userId
        return (
          <View key={r.id} style={[styles.replyCard, { borderColor: colors.border }]}>
            <View style={styles.commentHeader}>
              <Text style={[styles.commentUser, { color: colors.text }]}>{r.userName || 'Anonymous'}</Text>
              <Text style={[styles.commentDate, { color: colors.textSecondary }]}>
                {new Date(r.createdAt).toLocaleDateString()}
              </Text>
            </View>
            <Text style={[styles.commentText, { color: colors.text }]}>{r.text}</Text>
            {replyIsOwner && (
              <TouchableOpacity onPress={() => onDelete(r.id, c.id)} activeOpacity={0.7} style={{ marginTop: 6 }}>
                <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: colors.error || '#DC2626' }}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        )
      })}
    </View>
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
  likeRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  likeButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
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
