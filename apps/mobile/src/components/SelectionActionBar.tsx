import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../context/ThemeContext'

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
  isMultiWord, onDictionary, onTranslate, onSpeak, onSaveWord,
  isSpeaking, wordSaved, isAuthenticated,
}: SelectionActionBarProps) {
  const { colors } = useTheme()

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
      {!isMultiWord && (
        <TouchableOpacity style={styles.btn} onPress={onDictionary}>
          <Ionicons name="book-outline" size={18} color={colors.text} />
        </TouchableOpacity>
      )}
      <TouchableOpacity style={styles.btn} onPress={onTranslate}>
        <Ionicons name="language-outline" size={18} color={colors.text} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.btn} onPress={onSpeak}>
        <Ionicons name={isSpeaking ? 'stop' : 'volume-high-outline'} size={18} color={colors.text} />
      </TouchableOpacity>
      {isAuthenticated && !isMultiWord && (
        <TouchableOpacity
          style={[styles.btn, wordSaved && { opacity: 0.5 }]}
          onPress={onSaveWord}
          disabled={wordSaved}
        >
          <Ionicons
            name={wordSaved ? 'checkmark-circle' : 'add-circle-outline'}
            size={18}
            color={wordSaved ? colors.success : colors.text}
          />
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  btn: {
    width: 36,
    height: 36,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
