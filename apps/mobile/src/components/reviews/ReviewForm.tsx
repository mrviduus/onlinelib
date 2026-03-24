import { useState } from 'react'
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Switch, ActivityIndicator } from 'react-native'
import { reviewsApi } from '@textstack/shared'
import { StarRatingInput } from './StarRatingInput'
import { useTheme } from '../../context/ThemeContext'
import { fonts } from '../../theme/typography'

interface ReviewFormProps {
  editionId: string
  onSubmit: () => void
  onCancel: () => void
}

export function ReviewForm({ editionId, onSubmit, onCancel }: ReviewFormProps) {
  const { colors } = useTheme()
  const [rating, setRating] = useState(0)
  const [title, setTitle] = useState('')
  const [reviewText, setReviewText] = useState('')
  const [isSpoiler, setIsSpoiler] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (rating < 1) { setError('Please select a rating'); return }
    if (!reviewText.trim()) { setError('Please write a review'); return }
    setSaving(true)
    setError('')
    try {
      await reviewsApi.submitReview(editionId, {
        rating,
        title: title.trim() || undefined,
        reviewText: reviewText.trim(),
        isSpoiler,
      })
      onSubmit()
    } catch (e: any) {
      setError(e.message || 'Failed to submit')
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={[styles.form, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.text }]}>Your Rating</Text>
      <StarRatingInput rating={rating} onRate={setRating} size={32} />

      <Text style={[styles.label, { color: colors.text, marginTop: 16 }]}>Title (optional)</Text>
      <TextInput
        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
        value={title}
        onChangeText={setTitle}
        placeholder="Review title..."
        placeholderTextColor={colors.textSecondary}
        maxLength={200}
      />

      <Text style={[styles.label, { color: colors.text }]}>Review</Text>
      <TextInput
        style={[styles.input, styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
        value={reviewText}
        onChangeText={setReviewText}
        placeholder="Write your review..."
        placeholderTextColor={colors.textSecondary}
        multiline
        maxLength={10000}
        textAlignVertical="top"
      />

      <View style={styles.spoilerRow}>
        <Text style={[styles.spoilerLabel, { color: colors.text }]}>Contains spoilers</Text>
        <Switch value={isSpoiler} onValueChange={setIsSpoiler} trackColor={{ true: colors.primary }} />
      </View>

      {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}

      <View style={styles.buttonRow}>
        <TouchableOpacity style={[styles.cancelButton, { borderColor: colors.border }]} onPress={onCancel} activeOpacity={0.7}>
          <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.submitButton, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
          onPress={handleSubmit}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.submitText}>Submit</Text>}
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  form: { padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 16 },
  label: { fontFamily: fonts.sansMedium, fontSize: 14, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontFamily: fonts.sans, fontSize: 14, marginBottom: 12 },
  textArea: { height: 120, textAlignVertical: 'top' },
  spoilerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  spoilerLabel: { fontFamily: fonts.sans, fontSize: 14 },
  error: { fontFamily: fonts.sans, fontSize: 13, marginBottom: 8 },
  buttonRow: { flexDirection: 'row', gap: 10 },
  cancelButton: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  cancelText: { fontFamily: fonts.sansMedium, fontSize: 14 },
  submitButton: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  submitText: { color: '#fff', fontFamily: fonts.sansMedium, fontSize: 14 },
})
