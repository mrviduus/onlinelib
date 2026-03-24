import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { reviewsApi } from '@textstack/shared'
import type { PublicReviewDto, ReviewStatsDto } from '@textstack/shared/api/reviews'
import { ReviewCard } from './ReviewCard'
import { ReviewForm } from './ReviewForm'
import { RatingDistribution } from './RatingDistribution'
import { useTheme } from '../../context/ThemeContext'
import { useAuth } from '../../context/AuthContext'
import { fonts } from '../../theme/typography'

interface Props {
  editionId: string
}

const PAGE_SIZE = 5

export function ReviewsSection({ editionId }: Props) {
  const { colors } = useTheme()
  const { isAuthenticated } = useAuth()
  const [reviews, setReviews] = useState<PublicReviewDto[]>([])
  const [stats, setStats] = useState<ReviewStatsDto | null>(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [sort, setSort] = useState<'popular' | 'newest'>('popular')

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [s, r] = await Promise.all([
        reviewsApi.getBookReviewStats(editionId),
        reviewsApi.getBookReviews(editionId, { sort, limit: PAGE_SIZE }),
      ])
      setStats(s)
      setReviews(r.items)
      setTotal(r.total)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [editionId, sort])

  const loadMore = async () => {
    try {
      const r = await reviewsApi.getBookReviews(editionId, { sort, limit: PAGE_SIZE, offset: reviews.length })
      setReviews(prev => [...prev, ...r.items])
    } catch {}
  }

  if (loading) {
    return <ActivityIndicator style={{ padding: 20 }} color={colors.primary} />
  }

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Reviews</Text>
        {isAuthenticated && !showForm && (
          <TouchableOpacity onPress={() => setShowForm(true)} activeOpacity={0.7}>
            <Text style={[styles.writeButton, { color: colors.primary }]}>Write Review</Text>
          </TouchableOpacity>
        )}
      </View>

      {stats && <RatingDistribution stats={stats} />}

      {showForm && (
        <ReviewForm
          editionId={editionId}
          onSubmit={() => { setShowForm(false); fetchAll() }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Sort */}
      {reviews.length > 0 && (
        <View style={styles.sortRow}>
          {(['popular', 'newest'] as const).map(s => (
            <TouchableOpacity
              key={s}
              onPress={() => setSort(s)}
              style={[styles.sortChip, sort === s && { backgroundColor: colors.primaryLight }]}
              activeOpacity={0.7}
            >
              <Text style={[styles.sortText, { color: sort === s ? colors.primary : colors.textSecondary }]}>
                {s === 'popular' ? 'Most Helpful' : 'Newest'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {reviews.map(r => (
        <ReviewCard
          key={r.id}
          review={r}
          isAuthenticated={isAuthenticated}
          onLike={() => reviewsApi.likeReview(r.id).catch(() => {})}
          onUnlike={() => reviewsApi.unlikeReview(r.id).catch(() => {})}
        />
      ))}

      {reviews.length < total && (
        <TouchableOpacity onPress={loadMore} style={[styles.loadMore, { borderColor: colors.border }]} activeOpacity={0.7}>
          <Text style={[styles.loadMoreText, { color: colors.primary }]}>Load More</Text>
        </TouchableOpacity>
      )}

      {reviews.length === 0 && !showForm && (
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No reviews yet. Be the first!</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 16, marginTop: 8 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontFamily: fonts.serifBold, fontSize: 20 },
  writeButton: { fontFamily: fonts.sansMedium, fontSize: 14 },
  sortRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  sortChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  sortText: { fontFamily: fonts.sansMedium, fontSize: 13 },
  loadMore: { paddingVertical: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center', marginTop: 4 },
  loadMoreText: { fontFamily: fonts.sansMedium, fontSize: 14 },
  emptyText: { fontFamily: fonts.sans, fontSize: 14, textAlign: 'center', paddingVertical: 20 },
})
