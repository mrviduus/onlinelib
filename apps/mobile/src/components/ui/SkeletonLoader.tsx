import { useEffect, useRef } from 'react'
import { View, Animated, StyleSheet, ViewStyle } from 'react-native'
import { useTheme } from '../../context/ThemeContext'

interface SkeletonLoaderProps {
  width?: number | string
  height?: number
  borderRadius?: number
  style?: ViewStyle
}

export function SkeletonLoader({ width = '100%', height = 16, borderRadius = 4, style }: SkeletonLoaderProps) {
  const { colors } = useTheme()
  const opacity = useRef(new Animated.Value(0.3)).current

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [opacity])

  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius, backgroundColor: colors.border, opacity },
        style,
      ]}
    />
  )
}

export function BookCardSkeleton() {
  return (
    <View style={skeletonStyles.bookCard}>
      <SkeletonLoader height={180} borderRadius={6} />
      <SkeletonLoader width="80%" height={14} style={{ marginTop: 8 }} />
      <SkeletonLoader width="50%" height={12} style={{ marginTop: 4 }} />
    </View>
  )
}

export function BookGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <View style={skeletonStyles.grid}>
      {Array.from({ length: count }).map((_, i) => (
        <BookCardSkeleton key={i} />
      ))}
    </View>
  )
}

const skeletonStyles = StyleSheet.create({
  bookCard: {
    width: '48%',
    marginBottom: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
})
