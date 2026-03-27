import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../context/ThemeContext'
import { fonts } from '../theme/typography'

const STAGE_LABELS: Record<number, { label: string; color: string }> = {
  0: { label: 'New', color: '#3b82f6' },
  1: { label: '★1', color: '#eab308' },
  2: { label: '★2', color: '#eab308' },
  3: { label: '★3', color: '#22c55e' },
  4: { label: '✓', color: '#22c55e' },
}

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
  onMarkKnown?: () => void
  isSpeaking?: boolean
  wordSaved?: boolean
  vocabStage?: number | null
  isAuthenticated?: boolean
}

export function SelectionActionBar({
  selectedText, isMultiWord, onDictionary, onTranslate, onSpeak, onSaveWord, onHighlight,
  onMarkKnown, isSpeaking, wordSaved, vocabStage, isAuthenticated,
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
      {isAuthenticated && !isMultiWord && (() => {
        const stage = vocabStage != null ? STAGE_LABELS[vocabStage] : null
        return (
          <>
            {stage && (
              <View style={[styles.stageBadge, { backgroundColor: stage.color + '20', borderColor: stage.color + '40' }]}>
                <Text style={[styles.stageBadgeText, { color: stage.color }]}>{stage.label}</Text>
              </View>
            )}
            {stage && vocabStage !== 4 && onMarkKnown && (
              <TouchableOpacity style={styles.btn} onPress={onMarkKnown}>
                <Ionicons name="checkmark-done" size={18} color="#22c55e" />
              </TouchableOpacity>
            )}
            {!stage && (
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
          </>
        )
      })()}
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
  stageBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  stageBadgeText: {
    fontSize: 11,
    fontFamily: fonts.sansMedium,
  },
})
