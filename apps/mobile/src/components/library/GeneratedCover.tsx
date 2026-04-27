import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { fonts } from '../../theme/typography'

interface Props {
  title: string
  author?: string | null
  style?: StyleProp<ViewStyle>
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h)
  return Math.abs(h)
}

function hsl(h: number, s: number, l: number): string {
  return `hsl(${h}, ${s}%, ${l}%)`
}

export function GeneratedCover({ title, author, style }: Props) {
  const seed = hash(`${title}|${author ?? ''}`)
  const hue = seed % 360
  const initial = (title?.trim()?.[0] ?? '?').toUpperCase()
  return (
    <View style={[styles.cover, { backgroundColor: hsl(hue, 50, 45) }, style]}>
      <Text style={styles.initial}>{initial}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  cover: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  initial: {
    fontFamily: fonts.serifBold,
    fontSize: 36,
    color: 'rgba(255,255,255,0.9)',
  },
})
