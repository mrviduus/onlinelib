import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../context/ThemeContext'
import { fonts } from '../theme/typography'

interface SelectionActionBarProps {
  selectedText: string
  isMultiWord: boolean
  onDictionary: () => void
  onTranslate: () => void
  onSpeak: () => void
  onSaveWord: () => void
  isSpeaking?: boolean
  wordSaved?: boolean
  isAuthenticated?: boolean
}

export function SelectionActionBar({
  selectedText, isMultiWord, onDictionary, onTranslate, onSpeak, onSaveWord,
  isSpeaking, wordSaved, isAuthenticated,
}: SelectionActionBarProps) {
  const { colors } = useTheme()

  return (
    <View style={[styles.container, { backgroundColor: colors.primaryLight, borderTopColor: colors.border }]}>
      <Text style={[styles.selectedText, { color: colors.text }]} numberOfLines={1}>
        "{selectedText}"
      </Text>
      <View style={styles.actions}>
        {!isMultiWord && (
          <TouchableOpacity style={styles.actionBtn} onPress={onDictionary}>
            <Ionicons name="book-outline" size={20} color={colors.primary} />
            <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>Dict</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.actionBtn} onPress={onTranslate}>
          <Ionicons name="language-outline" size={20} color={colors.primary} />
          <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>Translate</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={onSpeak}>
          <Ionicons name={isSpeaking ? 'stop' : 'volume-high-outline'} size={20} color={colors.primary} />
          <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>{isSpeaking ? 'Stop' : 'TTS'}</Text>
        </TouchableOpacity>
        {isAuthenticated && !isMultiWord && (
          <TouchableOpacity
            style={[styles.actionBtn, wordSaved && { opacity: 0.6 }]}
            onPress={onSaveWord}
            disabled={wordSaved}
          >
            <Ionicons
              name={wordSaved ? 'checkmark-circle' : 'add-circle-outline'}
              size={20}
              color={wordSaved ? colors.success : colors.primary}
            />
            <Text style={[styles.actionLabel, { color: wordSaved ? colors.success : colors.textSecondary }]}>
              {wordSaved ? 'Saved' : 'Save'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  selectedText: {
    flex: 1,
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    marginRight: 8,
  },
  actions: { flexDirection: 'row', gap: 2 },
  actionBtn: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
  },
  actionLabel: {
    fontFamily: fonts.sans,
    fontSize: 10,
    marginTop: 2,
  },
})
