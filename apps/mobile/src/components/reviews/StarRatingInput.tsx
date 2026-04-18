import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

interface StarRatingInputProps {
  rating: number
  onRate: (value: number) => void
  size?: number
  color?: string
  disabled?: boolean
}

export function StarRatingInput({ rating, onRate, size = 28, color = '#F59E0B', disabled }: StarRatingInputProps) {
  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map(star => (
        <TouchableOpacity
          key={star}
          onPress={() => !disabled && onRate(star === rating ? 0 : star)}
          activeOpacity={0.7}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`Rate ${star} star${star === 1 ? '' : 's'}`}
          accessibilityState={{ selected: rating >= star, disabled: !!disabled }}
        >
          <Ionicons
            name={rating >= star ? 'star' : rating >= star - 0.5 ? 'star-half' : 'star-outline'}
            size={size}
            color={color}
          />
        </TouchableOpacity>
      ))}
    </View>
  )
}

export function StarRatingDisplay({ rating, size = 16, color = '#F59E0B' }: { rating: number; size?: number; color?: string }) {
  return (
    <View
      style={styles.row}
      accessibilityLabel={`Rating: ${rating.toFixed(1)} out of 5`}
      accessibilityRole="text"
    >
      {[1, 2, 3, 4, 5].map(star => (
        <Ionicons
          key={star}
          name={rating >= star ? 'star' : rating >= star - 0.5 ? 'star-half' : 'star-outline'}
          size={size}
          color={color}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4 },
})
