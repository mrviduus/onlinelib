import { View, TouchableOpacity, StyleSheet } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../context/ThemeContext'

const HIGHLIGHT_COLORS = [
  { key: 'yellow', color: '#fef08a' },
  { key: 'green', color: '#bbf7d0' },
  { key: 'pink', color: '#fbcfe8' },
  { key: 'blue', color: '#bfdbfe' },
] as const

interface SelectionActionBarProps {
  selectedText: string
  isMultiWord: boolean
  onDictionary: () => void
  onTranslate: () => void
  onSpeak: () => void
  onSaveWord: () => void
  onHighlight?: (color: string) => void
  isSpeaking?: boolean
  wordSaved?: boolean
  isAuthenticated?: boolean
}

export function SelectionActionBar({
  selectedText, isMultiWord, onDictionary, onTranslate, onSpeak, onSaveWord, onHighlight,
  isSpeaking, wordSaved, isAuthenticated,
}: SelectionActionBarProps) {
  const { colors } = useTheme()

  const handleCopy = () => {
    if (selectedText) Clipboard.setStringAsync(selectedText)
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
      {/* Highlight color buttons */}
      {isAuthenticated && onHighlight && (
        <>
          {HIGHLIGHT_COLORS.map(h => (
            <TouchableOpacity
              key={h.key}
              style={[styles.colorBtn, { backgroundColor: h.color }]}
              onPress={() => onHighlight(h.key)}
            />
          ))}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
        </>
      )}

      <TouchableOpacity style={styles.btn} onPress={handleCopy}>
        <Ionicons name="copy-outline" size={18} color={colors.text} />
      </TouchableOpacity>
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
  colorBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.15)',
  },
  divider: {
    width: 1,
    height: 20,
    marginHorizontal: 4,
  },
})
