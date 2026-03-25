import { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native'
import { Image } from 'expo-image'
import { Ionicons } from '@expo/vector-icons'
import { reviewsApi } from '@textstack/shared'
import { StarRatingDisplay } from './StarRatingInput'
import { useTheme } from '../../context/ThemeContext'
import { fonts } from '../../theme/typography'
import type { PublicReviewDto, ReviewCommentDto } from '@textstack/shared/api/reviews'

interface ReviewCardProps {
  review: PublicReviewDto
  editionId?: string
  onLike?: () => void
  onUnlike?: () => void
  isAuthenticated?: boolean
}

export function ReviewCard({ review, editionId, onLike, onUnlike, isAuthenticated }: ReviewCardProps) {
  const { colors } = useTheme()
  const [showSpoiler, setShowSpoiler] = useState(false)
  const [liked, setLiked] = useState(review.isLikedByMe)
  const [helpfulCount, setHelpfulCount] = useState(review.helpfulCount)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [comments, setComments] = useState<ReviewCommentDto[]>([])
  const [commentText, setCommentText] = useState('')
  const [loadingComments, setLoadingComments] = useState(false)

  const toggleComments = async () => {
    if (commentsOpen) { setCommentsOpen(false); return }
    if (!editionId) return
    setCommentsOpen(true)
    if (comments.length === 0) {
      setLoadingComments(true)
      try {
        const res = await reviewsApi.getReviewComments(editionId, review.id)
        setComments(res.items)
      } catch {}
      setLoadingComments(false)
    }
  }

  const submitComment = async () => {
    if (!commentText.trim()) return
    try {
      const c = await reviewsApi.addReviewComment(review.id, commentText.trim())
      setComments(prev => [...prev, c])
      setCommentText('')
    } catch {}
  }

  const handleLike = () => {
    if (liked) {
      setLiked(false)
      setHelpfulCount(c => c - 1)
      onUnlike?.()
    } else {
      setLiked(true)
      setHelpfulCount(c => c + 1)
      onLike?.()
    }
  }

  const date = new Date(review.createdAt).toLocaleDateString()

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Header */}
      <View style={styles.header}>
        {review.userPicture ? (
          <Image source={{ uri: review.userPicture }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.avatarLetter, { color: colors.primary }]}>
              {(review.userName || 'A').charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={[styles.userName, { color: colors.text }]}>
            {review.userName || 'Anonymous'}
          </Text>
          <View style={styles.ratingRow}>
            <StarRatingDisplay rating={review.rating} size={14} />
            <Text style={[styles.date, { color: colors.textSecondary }]}>{date}</Text>
          </View>
        </View>
      </View>

      {/* Title */}
      {review.title && (
        <Text style={[styles.title, { color: colors.text }]}>{review.title}</Text>
      )}

      {/* Body */}
      {review.isSpoiler && !showSpoiler ? (
        <TouchableOpacity onPress={() => setShowSpoiler(true)}>
          <Text style={[styles.spoilerText, { color: colors.textSecondary }]}>
            This review contains spoilers. Tap to reveal.
          </Text>
        </TouchableOpacity>
      ) : (
        <Text style={[styles.body, { color: colors.text }]}>{review.reviewText}</Text>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        {isAuthenticated && (
          <TouchableOpacity style={styles.actionButton} onPress={handleLike} activeOpacity={0.7}>
            <Ionicons
              name={liked ? 'thumbs-up' : 'thumbs-up-outline'}
              size={16}
              color={liked ? colors.primary : colors.textSecondary}
            />
            {helpfulCount > 0 && (
              <Text style={[styles.actionText, { color: liked ? colors.primary : colors.textSecondary }]}>
                {helpfulCount}
              </Text>
            )}
          </TouchableOpacity>
        )}
        {review.commentCount > 0 || isAuthenticated ? (
          <TouchableOpacity style={styles.actionButton} onPress={toggleComments} activeOpacity={0.7}>
            <Ionicons name="chatbubble-outline" size={16} color={colors.textSecondary} />
            {review.commentCount > 0 && (
              <Text style={[styles.actionText, { color: colors.textSecondary }]}>{review.commentCount}</Text>
            )}
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Comments */}
      {commentsOpen && (
        <View style={[styles.commentsSection, { borderTopColor: colors.border }]}>
          {loadingComments ? (
            <Text style={[styles.commentMeta, { color: colors.textSecondary }]}>Loading...</Text>
          ) : (
            <>
              {comments.map(c => (
                <View key={c.id} style={styles.commentRow}>
                  <Text style={[styles.commentUser, { color: colors.text }]}>{c.userName || 'Anonymous'}</Text>
                  <Text style={[styles.commentBody, { color: colors.text }]}>{c.text}</Text>
                  <Text style={[styles.commentMeta, { color: colors.textSecondary }]}>
                    {new Date(c.createdAt).toLocaleDateString()}
                  </Text>
                </View>
              ))}
              {isAuthenticated && (
                <View style={[styles.commentInput, { borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.commentField, { color: colors.text }]}
                    value={commentText}
                    onChangeText={setCommentText}
                    placeholder="Add a comment..."
                    placeholderTextColor={colors.textSecondary}
                    multiline
                  />
                  <TouchableOpacity onPress={submitComment} disabled={!commentText.trim()} activeOpacity={0.7}>
                    <Ionicons name="send" size={18} color={commentText.trim() ? colors.primary : colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  avatarLetter: { fontFamily: fonts.sansMedium, fontSize: 16 },
  userName: { fontFamily: fonts.sansMedium, fontSize: 14 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  date: { fontFamily: fonts.sans, fontSize: 12 },
  title: { fontFamily: fonts.sansMedium, fontSize: 15, marginBottom: 6 },
  body: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
  spoilerText: { fontFamily: fonts.sans, fontSize: 14, fontStyle: 'italic' },
  actions: { flexDirection: 'row', marginTop: 10, gap: 16 },
  actionButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { fontFamily: fonts.sans, fontSize: 13 },
  commentsSection: { marginTop: 12, paddingTop: 12, borderTopWidth: 1 },
  commentRow: { marginBottom: 10 },
  commentUser: { fontFamily: fonts.sansMedium, fontSize: 13 },
  commentBody: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18, marginTop: 2 },
  commentMeta: { fontFamily: fonts.sans, fontSize: 11, marginTop: 2 },
  commentInput: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginTop: 8 },
  commentField: { flex: 1, fontFamily: fonts.sans, fontSize: 13, maxHeight: 60, padding: 0 },
})
