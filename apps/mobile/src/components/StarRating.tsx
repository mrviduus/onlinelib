import { useState, useEffect, useRef, useCallback } from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { reviewsApi } from '@textstack/shared'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

interface StarRatingProps {
  editionId?: string
  userBookId?: string
}

export function StarRating({ editionId, userBookId }: StarRatingProps) {
  const { isAuthenticated } = useAuth()
  const toast = useToast()
  const [rating, setRating] = useState(0)
  const [saving, setSaving] = useState(false)
  const mountedRef = useRef(true)

  const bookId = userBookId || editionId
  const isUserBook = !!userBookId

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Cancellation flag prevents stale fetch from a previous book overwriting
  // the current rating when the user navigates between books quickly.
  useEffect(() => {
    if (!isAuthenticated || !bookId) return
    let cancelled = false
    const fetch = isUserBook
      ? reviewsApi.getUserBookRating(bookId)
      : reviewsApi.getAllRatings().then(all => all.find(r => r.editionId === bookId) || null)
    fetch
      .then(r => {
        if (cancelled) return
        setRating(r ? r.rating : 0)
      })
      .catch(e => {
        if (!cancelled) console.warn('Star rating load failed:', e)
      })
    return () => { cancelled = true }
  }, [isAuthenticated, bookId, isUserBook])

  const handlePress = useCallback(async (value: number) => {
    if (saving || !bookId) return
    // Optimistic update with snapshot for rollback. Without it, a network
    // failure would leave the UI showing the new rating while the server
    // never accepted it — a silent data/UI mismatch.
    const previousRating = rating
    const isUnset = value === previousRating
    const nextRating = isUnset ? 0 : value
    setRating(nextRating)
    setSaving(true)
    try {
      if (isUnset) {
        if (isUserBook) {
          await reviewsApi.deleteUserBookRating(bookId)
        } else {
          await reviewsApi.deleteReview(bookId)
        }
      } else if (isUserBook) {
        await reviewsApi.upsertUserBookRating(bookId, { rating: value })
      } else {
        await reviewsApi.submitReview(bookId, { rating: value })
      }
    } catch (e) {
      console.warn('Star rating save failed:', e)
      if (mountedRef.current) {
        setRating(previousRating)
        toast.show({ message: 'Could not save rating', variant: 'error' })
      }
    } finally {
      if (mountedRef.current) setSaving(false)
    }
  }, [saving, bookId, isUserBook, rating, toast])

  if (!isAuthenticated) return null

  return (
    <View style={styles.container} accessibilityLabel={rating > 0 ? `Rated ${rating} of 5 stars` : 'Not rated'}>
      {[1, 2, 3, 4, 5].map(star => {
        const filled = star <= rating
        return (
          <TouchableOpacity
            key={star}
            onPress={() => handlePress(star)}
            disabled={saving}
            activeOpacity={0.6}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={`Rate ${star} ${star === 1 ? 'star' : 'stars'}`}
            accessibilityState={{ selected: filled, disabled: saving }}
          >
            <Ionicons
              name={filled ? 'star' : 'star-outline'}
              size={28}
              color={filled ? '#F59E0B' : '#D1D5DB'}
            />
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', gap: 4 },
})
