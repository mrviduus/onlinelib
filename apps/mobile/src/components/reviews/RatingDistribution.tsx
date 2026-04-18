import { View, Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../context/ThemeContext'
import { fonts } from '../../theme/typography'
import type { ReviewStatsDto } from '@textstack/shared/api/reviews'

interface Props {
  stats: ReviewStatsDto
}

export function RatingDistribution({ stats }: Props) {
  const { colors } = useTheme()
  if (stats.totalRatings === 0) return null

  const bars = [
    { star: 5, count: stats.distribution.star5 },
    { star: 4, count: stats.distribution.star4 },
    { star: 3, count: stats.distribution.star3 },
    { star: 2, count: stats.distribution.star2 },
    { star: 1, count: stats.distribution.star1 },
  ]

  return (
    <View
      style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}
      accessibilityLabel={`Average rating ${stats.avgRating.toFixed(1)} from ${stats.totalRatings} ${stats.totalRatings === 1 ? 'rating' : 'ratings'}`}
    >
      <View style={styles.avgRow}>
        <Ionicons name="star" size={20} color="#F59E0B" />
        <Text style={[styles.avgText, { color: colors.text }]}>
          {stats.avgRating.toFixed(1)}
        </Text>
        <Text style={[styles.totalText, { color: colors.textSecondary }]}>
          ({stats.totalRatings} {stats.totalRatings === 1 ? 'rating' : 'ratings'})
        </Text>
      </View>
      {bars.map(({ star, count }) => {
        const pct = stats.totalRatings > 0 ? (count / stats.totalRatings) * 100 : 0
        return (
          <View key={star} style={styles.barRow}>
            <Text style={[styles.starLabel, { color: colors.textSecondary }]}>{star}</Text>
            <View style={[styles.barBg, { backgroundColor: colors.border }]}>
              <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: '#F59E0B' }]} />
            </View>
            <Text style={[styles.countLabel, { color: colors.textSecondary }]}>{count}</Text>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 16 },
  avgRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  avgText: { fontFamily: fonts.serifBold, fontSize: 24 },
  totalText: { fontFamily: fonts.sans, fontSize: 13 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  starLabel: { fontFamily: fonts.sansMedium, fontSize: 13, width: 14, textAlign: 'center' },
  barBg: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  countLabel: { fontFamily: fonts.sans, fontSize: 12, width: 28, textAlign: 'right' },
})
