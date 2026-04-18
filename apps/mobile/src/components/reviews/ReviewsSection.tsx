import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native'
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
  const [sort, setSort] = useState<'popular' | 'newest' | 'oldest'>('popular')
  const [ratingFilter, setRatingFilter] = useState<number | null>(null)
  const fetchGenRef = useRef(0)
  const loadingMoreRef = useRef(false)

  const fetchAll = useCallback(async () => {
    const gen = ++fetchGenRef.current
    setLoading(true)
    try {
      const [s, r] = await Promise.all([
        reviewsApi.getBookReviewStats(editionId),
        reviewsApi.getBookReviews(editionId, { sort, limit: PAGE_SIZE, rating: ratingFilter || undefined }),
      ])
      if (gen !== fetchGenRef.current) return
      setStats(s)
      setReviews(r.items)
      setTotal(r.total)
    } catch (e) {
      if (gen === fetchGenRef.current) console.warn('Reviews fetch failed:', e)
    } finally {
      if (gen === fetchGenRef.current) setLoading(false)
    }
  }, [editionId, sort, ratingFilter])

  useEffect(() => { fetchAll() }, [fetchAll])

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current) return
    loadingMoreRef.current = true
    const gen = fetchGenRef.current
    try {
      const r = await reviewsApi.getBookReviews(editionId, {
        sort,
        limit: PAGE_SIZE,
        offset: reviews.length,
        rating: ratingFilter || undefined,
      })
      // Filter may have changed mid-request — drop stale results.
      if (gen !== fetchGenRef.current) return
      setReviews(prev => [...prev, ...r.items])
    } catch (e) {
      console.warn('Reviews load more failed:', e)
    } finally {
      loadingMoreRef.current = false
    }
  }, [editionId, sort, ratingFilter, reviews.length])

  const handleRatingFilter = (r: number) => {
    setRatingFilter(ratingFilter === r ? null : r)
  }

  if (loading) {
    return <ActivityIndicator style={{ padding: 20 }} color={colors.primary} />
  }

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Reviews</Text>
        {isAuthenticated && !showForm && (
          <TouchableOpacity
            onPress={() => setShowForm(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Write a review"
          >
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

      {/* Rating filter */}
      {stats && stats.totalRatings > 0 && (
        <View style={styles.sortRow}>
          {[5, 4, 3, 2, 1].map(r => (
            <TouchableOpacity
              key={r}
              onPress={() => handleRatingFilter(r)}
              style={[styles.sortChip, ratingFilter === r && { backgroundColor: colors.primaryLight }]}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Filter by ${r} stars`}
              accessibilityState={{ selected: ratingFilter === r }}
            >
              <Text style={[styles.sortText, { color: ratingFilter === r ? colors.primary : colors.textSecondary }]}>
                {r}★
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Sort */}
      {reviews.length > 0 && (
        <View style={styles.sortRow}>
          {([['popular', 'Most Helpful'], ['newest', 'Newest'], ['oldest', 'Oldest']] as const).map(([s, label]) => (
            <TouchableOpacity
              key={s}
              onPress={() => setSort(s)}
              style={[styles.sortChip, sort === s && { backgroundColor: colors.primaryLight }]}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Sort by ${label}`}
              accessibilityState={{ selected: sort === s }}
            >
              <Text style={[styles.sortText, { color: sort === s ? colors.primary : colors.textSecondary }]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {reviews.map(r => (
        <ReviewCard
          key={r.id}
          review={r}
          editionId={editionId}
          isAuthenticated={isAuthenticated}
          onLike={() => reviewsApi.likeReview(r.id).catch(e => console.warn('Like review failed:', e))}
          onUnlike={() => reviewsApi.unlikeReview(r.id).catch(e => console.warn('Unlike review failed:', e))}
        />
      ))}

      {reviews.length < total && (
        <TouchableOpacity
          onPress={loadMore}
          style={[styles.loadMore, { borderColor: colors.border }]}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Load more reviews"
        >
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
