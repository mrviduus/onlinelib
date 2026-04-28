import { useEffect, useRef } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../context/ThemeContext'
import { useLanguage } from '../../context/LanguageContext'
import { fonts } from '../../theme/typography'

export type BookStatusVariant = 'processing' | 'failed' | 'new' | 'finished'

interface Props {
  variant: BookStatusVariant
  onPress?: () => void
  title?: string
}

function bgFor(variant: BookStatusVariant, colors: ReturnType<typeof useTheme>['colors']): string {
  switch (variant) {
    case 'processing': return '#F59E0B' // amber
    case 'failed': return colors.error
    case 'new': return colors.primary
    case 'finished': return colors.success
  }
}

function Spinner() {
  const spin = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }),
    )
    loop.start()
    return () => loop.stop()
  }, [spin])
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <Ionicons name="sync-outline" size={10} color="#fff" />
    </Animated.View>
  )
}

export function BookStatusBadge({ variant, onPress, title }: Props) {
  const { colors } = useTheme()
  const { t } = useLanguage()
  const label = t(`library.badge.${variant}`)
  const bg = bgFor(variant, colors)

  const inner = (
    <>
      {variant === 'processing' && <Spinner />}
      {variant === 'finished' && <Ionicons name="checkmark" size={10} color="#fff" />}
      <Text style={styles.text}>{label}</Text>
    </>
  )

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={title || label}
        style={[styles.pill, { backgroundColor: bg }]}
        activeOpacity={0.7}
      >
        {inner}
      </TouchableOpacity>
    )
  }

  return (
    <View accessibilityLabel={title || label} style={[styles.pill, { backgroundColor: bg }]}>
      {inner}
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  text: {
    color: '#fff',
    fontFamily: fonts.sansMedium,
    fontSize: 10,
  },
})
