import { useState } from 'react'
import { View, TextInput, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../context/ThemeContext'
import { fonts } from '../theme/typography'

interface ReaderSearchBarProps {
  onSearch: (query: string) => void
  onNext: () => void
  onPrev: () => void
  onClose: () => void
  matchCount: number
  currentMatch: number
}

export function ReaderSearchBar({ onSearch, onNext, onPrev, onClose, matchCount, currentMatch }: ReaderSearchBarProps) {
  const { colors } = useTheme()
  const [query, setQuery] = useState('')

  const handleChange = (text: string) => {
    setQuery(text)
    onSearch(text)
  }

  return (
    <View style={[styles.container, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
      <TextInput
        style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border, fontFamily: fonts.sans }]}
        value={query}
        onChangeText={handleChange}
        placeholder="Search in chapter..."
        placeholderTextColor={colors.textSecondary}
        autoFocus
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        accessibilityLabel="Search in chapter"
      />
      {matchCount > 0 && (
        <Text
          style={[styles.count, { color: colors.textSecondary }]}
          accessibilityLabel={`Match ${currentMatch} of ${matchCount}`}
        >
          {currentMatch}/{matchCount}
        </Text>
      )}
      <TouchableOpacity
        onPress={onPrev}
        style={styles.navBtn}
        disabled={matchCount === 0}
        accessibilityRole="button"
        accessibilityLabel="Previous match"
        accessibilityState={{ disabled: matchCount === 0 }}
      >
        <Ionicons name="chevron-up" size={18} color={matchCount === 0 ? colors.textSecondary : colors.primary} style={matchCount === 0 ? { opacity: 0.3 } : undefined} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onNext}
        style={styles.navBtn}
        disabled={matchCount === 0}
        accessibilityRole="button"
        accessibilityLabel="Next match"
        accessibilityState={{ disabled: matchCount === 0 }}
      >
        <Ionicons name="chevron-down" size={18} color={matchCount === 0 ? colors.textSecondary : colors.primary} style={matchCount === 0 ? { opacity: 0.3 } : undefined} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onClose}
        style={styles.closeBtn}
        accessibilityRole="button"
        accessibilityLabel="Close search"
      >
        <Ionicons name="close" size={22} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  count: {
    fontSize: 12,
    marginLeft: 8,
    minWidth: 30,
  },
  navBtn: { padding: 6, marginLeft: 4 },
  closeBtn: { padding: 6, marginLeft: 4 },
})
