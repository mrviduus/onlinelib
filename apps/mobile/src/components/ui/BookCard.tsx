import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Image } from 'expo-image'
import { useTheme } from '../../context/ThemeContext'
import { typography, fonts } from '../../theme/typography'

interface BookCardProps {
  title: string
  author?: string
  coverUrl?: string | null
  onPress: () => void
}

export function BookCard({ title, author, coverUrl, onPress }: BookCardProps) {
  const { colors } = useTheme()

  return (
    <TouchableOpacity
      style={[styles.container]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={[styles.coverWrapper, { backgroundColor: colors.surface }]}>
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} style={styles.cover} contentFit="cover" />
        ) : (
          <View style={[styles.cover, styles.placeholder, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.placeholderText, { color: colors.primary }]}>
              {title.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
      </View>
      <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
        {title}
      </Text>
      {author && (
        <Text style={[styles.author, { color: colors.textSecondary }]} numberOfLines={1}>
          {author}
        </Text>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    width: '48%',
    marginBottom: 20,
  },
  coverWrapper: {
    aspectRatio: 2 / 3,
    borderRadius: 6,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  cover: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontFamily: fonts.serif,
    fontSize: 48,
  },
  title: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    lineHeight: 18,
    marginTop: 8,
  },
  author: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
})
