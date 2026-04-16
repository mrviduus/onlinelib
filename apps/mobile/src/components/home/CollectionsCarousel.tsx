/**
 * Horizontally-scrolling "collections" row for the home screen.
 *
 * Each pill/card maps to a mood (happy, melancholic, thrilling, etc.)
 * or an editorial grouping. Tapping a collection routes to the search
 * screen pre-filtered by that collection.
 *
 * Data source: `getAllMoods()` from `@textstack/shared`. Cards fall
 * back to a calm gradient placeholder when no emoji is set.
 */

import { memo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native'
import type { MoodDto } from '@textstack/shared'
import { useTheme } from '../../context/ThemeContext'
import { fonts } from '../../theme/typography'

interface Props {
  title: string
  moods: MoodDto[]
  loading?: boolean
  emptyText?: string
  onSelect: (mood: MoodDto) => void
}

const CARD_WIDTH = 140
const CARD_HEIGHT = 88
const CARD_GAP = 10

// Deterministic color wheel per slug so the same mood always gets the
// same background across sessions. Soft, bookish palette.
const CARD_COLORS = [
  '#FDE7E3', // blush
  '#E3F0FD', // sky
  '#E8F3E6', // sage
  '#FFF4D6', // butter
  '#F1E7FB', // lilac
  '#FEE5D1', // apricot
  '#E3F4F1', // mint
  '#FBE7F2', // rose
]

function pickColor(slug: string): string {
  let h = 0
  for (let i = 0; i < slug.length; i++) {
    h = (h * 31 + slug.charCodeAt(i)) | 0
  }
  return CARD_COLORS[Math.abs(h) % CARD_COLORS.length]
}

export const CollectionsCarousel = memo(function CollectionsCarousel({
  title,
  moods,
  loading,
  emptyText,
  onSelect,
}: Props) {
  const { colors } = useTheme()

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>

      {loading ? (
        <View style={styles.state}>
          <ActivityIndicator size="small" color={colors.textSecondary} />
        </View>
      ) : moods.length === 0 ? (
        <View style={styles.state}>
          {emptyText && (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {emptyText}
            </Text>
          )}
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scroller}
        >
          {moods.map((mood) => (
            <TouchableOpacity
              key={mood.id}
              style={[
                styles.card,
                {
                  width: CARD_WIDTH,
                  height: CARD_HEIGHT,
                  backgroundColor: pickColor(mood.slug),
                },
              ]}
              onPress={() => onSelect(mood)}
              activeOpacity={0.85}
            >
              {mood.emoji ? (
                <Text style={styles.emoji}>{mood.emoji}</Text>
              ) : null}
              <Text
                style={[styles.cardLabel, { color: '#1F2937' }]}
                numberOfLines={2}
              >
                {mood.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  )
})

const styles = StyleSheet.create({
  wrap: {
    marginTop: 20,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 18,
    lineHeight: 24,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  scroller: {
    paddingHorizontal: 16,
    paddingRight: 16 - CARD_GAP,
    gap: CARD_GAP,
  },
  card: {
    borderRadius: 12,
    padding: 14,
    justifyContent: 'space-between',
  },
  emoji: {
    fontSize: 24,
  },
  cardLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  state: {
    minHeight: CARD_HEIGHT,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  emptyText: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
  },
})
