/**
 * Horizontal-scrolling book carousel used on the home screen.
 * Mirrors the compact "cover + title + author" row pattern from
 * ElevenReader, but scoped to TextStack's data shape.
 *
 * One card = fixed width so many covers are visible at once. Parent
 * controls the section title + view-all action; this component is
 * purely presentational over an array of BookItems.
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
import { Image } from 'expo-image'
import { Ionicons } from '@expo/vector-icons'
import { getStorageUrl } from '@textstack/shared'
import { useTheme } from '../../context/ThemeContext'
import { fonts } from '../../theme/typography'

export interface BookItem {
  key: string // unique id (editionId or userBookId)
  title: string
  author?: string | null
  coverPath?: string | null
  badge?: string // optional overlay badge ("45%", "New")
  onPress: () => void
}

interface Props {
  title: string
  items: BookItem[]
  loading?: boolean
  emptyText?: string
  emptyCtaLabel?: string
  onEmptyCtaPress?: () => void
  onViewAll?: () => void
  viewAllLabel?: string
}

const CARD_WIDTH = 124
const CARD_GAP = 12

export const HorizontalBookList = memo(function HorizontalBookList({
  title,
  items,
  loading,
  emptyText,
  emptyCtaLabel,
  onEmptyCtaPress,
  onViewAll,
  viewAllLabel,
}: Props) {
  const { colors } = useTheme()

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        {onViewAll && (
          <TouchableOpacity
            onPress={onViewAll}
            activeOpacity={0.6}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={viewAllLabel ?? `See all ${title}`}
          >
            <Text style={[styles.viewAll, { color: colors.primary }]}>
              {viewAllLabel ?? 'See all'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.state}>
          <ActivityIndicator size="small" color={colors.textSecondary} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.state}>
          {emptyText && (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {emptyText}
            </Text>
          )}
          {emptyCtaLabel && onEmptyCtaPress && (
            <TouchableOpacity
              onPress={onEmptyCtaPress}
              activeOpacity={0.7}
              style={[styles.emptyCta, { borderColor: colors.border }]}
            >
              <Text style={[styles.emptyCtaLabel, { color: colors.text }]}>
                {emptyCtaLabel}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scroller}
        >
          {items.map((item) => (
            <BookCoverCell key={item.key} item={item} />
          ))}
        </ScrollView>
      )}
    </View>
  )
})

interface CellProps {
  item: BookItem
}

function BookCoverCell({ item }: CellProps) {
  const { colors } = useTheme()
  const uri = getStorageUrl(item.coverPath ?? null)

  return (
    <TouchableOpacity
      style={[styles.card, { width: CARD_WIDTH }]}
      onPress={item.onPress}
      activeOpacity={0.85}
    >
      <View
        style={[
          styles.coverWrapper,
          { backgroundColor: colors.surface },
        ]}
      >
        {uri ? (
          <Image source={{ uri }} style={styles.cover} contentFit="cover" />
        ) : (
          <View
            style={[
              styles.cover,
              styles.placeholder,
              { backgroundColor: colors.primaryLight },
            ]}
          >
            <Ionicons name="book" size={32} color={colors.primary} />
          </View>
        )}
        {item.badge && (
          <View style={[styles.badge, { backgroundColor: 'rgba(0,0,0,0.65)' }]}>
            <Text style={styles.badgeText}>{item.badge}</Text>
          </View>
        )}
      </View>
      <Text
        style={[styles.cardTitle, { color: colors.text }]}
        numberOfLines={2}
      >
        {item.title}
      </Text>
      {item.author ? (
        <Text
          style={[styles.cardAuthor, { color: colors.textSecondary }]}
          numberOfLines={1}
        >
          {item.author}
        </Text>
      ) : null}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 18,
    lineHeight: 24,
  },
  viewAll: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
  },
  scroller: {
    paddingHorizontal: 16,
    paddingRight: 16 - CARD_GAP, // balance final gap
    gap: CARD_GAP,
  },
  card: {
    // width applied inline
  },
  coverWrapper: {
    aspectRatio: 2 / 3,
    borderRadius: 6,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  cover: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    color: '#fff',
  },
  cardTitle: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    lineHeight: 17,
    marginTop: 8,
  },
  cardAuthor: {
    fontFamily: fonts.sans,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  state: {
    minHeight: 180,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 12,
  },
  emptyText: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
  },
  emptyCta: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  emptyCtaLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
  },
})
