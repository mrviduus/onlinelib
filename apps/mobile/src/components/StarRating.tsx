import { useState, useEffect } from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { reviewsApi } from '@textstack/shared'
import { useAuth } from '../context/AuthContext'

interface StarRatingProps {
  editionId?: string
  userBookId?: string
}

export function StarRating({ editionId, userBookId }: StarRatingProps) {
  const { isAuthenticated } = useAuth()
  const [rating, setRating] = useState(0)
  const [saving, setSaving] = useState(false)

  const bookId = userBookId || editionId
  const isUserBook = !!userBookId

  useEffect(() => {
    if (!isAuthenticated || !bookId) return
    const fetch = isUserBook
      ? reviewsApi.getUserBookRating(bookId)
      : reviewsApi.getAllRatings().then(all => all.find(r => r.editionId === bookId) || null)
    fetch.then(r => { if (r) setRating(r.rating) }).catch(() => {})
  }, [isAuthenticated, bookId, isUserBook])

  if (!isAuthenticated) return null

  const handlePress = async (value: number) => {
    if (saving || !bookId) return
    setSaving(true)
    try {
      if (value === rating) {
        isUserBook ? await reviewsApi.deleteUserBookRating(bookId) : await reviewsApi.deleteReview(bookId)
        setRating(0)
      } else {
        isUserBook
          ? await reviewsApi.upsertUserBookRating(bookId, { rating: value })
          : await reviewsApi.submitReview(bookId, { rating: value })
        setRating(value)
      }
    } catch {}
    setSaving(false)
  }

  return (
    <View style={styles.container}>
      {[1, 2, 3, 4, 5].map(star => (
        <TouchableOpacity
          key={star}
          onPress={() => handlePress(star)}
          disabled={saving}
          activeOpacity={0.6}
          hitSlop={4}
        >
          <Ionicons
            name={star <= rating ? 'star' : 'star-outline'}
            size={28}
            color={star <= rating ? '#F59E0B' : '#D1D5DB'}
          />
        </TouchableOpacity>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', gap: 4 },
})
