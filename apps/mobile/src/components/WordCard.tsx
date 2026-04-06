import { useState, useEffect, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Animated, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { translationApi } from '@textstack/shared'
import { useTheme } from '../context/ThemeContext'
import { fonts } from '../theme/typography'

const HIGHLIGHT_COLORS = [
  { key: 'yellow', color: '#fef08a' },
  { key: 'green', color: '#bbf7d0' },
  { key: 'pink', color: '#fbcfe8' },
  { key: 'blue', color: '#bfdbfe' },
] as const

const STAGE_LABELS: Record<number, { label: string; color: string }> = {
  0: { label: 'New', color: '#3b82f6' },
  1: { label: '★1', color: '#eab308' },
  2: { label: '★2', color: '#eab308' },
  3: { label: '★3', color: '#22c55e' },
  4: { label: '✓', color: '#22c55e' },
}

interface WordCardProps {
  word: string
  onSave: () => void
  onSpeak: () => void
  onDictionary: () => void
  onHighlight?: (color: string) => void
  onMarkKnown?: () => void
  onDismiss: () => void
  isSpeaking?: boolean
  wordSaved?: boolean
  vocabStage?: number | null
  isAuthenticated?: boolean
  language?: string
  sessionWordCount?: number
}

export function WordCard({
  word, onSave, onSpeak, onDictionary, onHighlight, onMarkKnown,
  onDismiss, isSpeaking, wordSaved, vocabStage, isAuthenticated, language = 'en',
  sessionWordCount = 0,
}: WordCardProps) {
  const { colors } = useTheme()
  const [expanded, setExpanded] = useState(false)
  const [translation, setTranslation] = useState('')
  const [translating, setTranslating] = useState(true)
  const [showSavedText, setShowSavedText] = useState(false)
  const slideAnim = useRef(new Animated.Value(0)).current
  const saveAnim = useRef(new Animated.Value(1)).current
  const savedTextOpacity = useRef(new Animated.Value(0)).current

  // Fetch translation on mount
  useEffect(() => {
    setTranslation('')
    setTranslating(true)
    translationApi.translate(word, language, language === 'en' ? 'uk' : 'en')
      .then((res: any) => setTranslation(res.translatedText || res.translation || ''))
      .catch(() => setTranslation(''))
      .finally(() => setTranslating(false))
  }, [word, language])

  // Entry animation
  useEffect(() => {
    Animated.spring(slideAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 10 }).start()
  }, [])

  // Save bounce + "Saved!" fade animation
  useEffect(() => {
    if (wordSaved) {
      setShowSavedText(true)
      savedTextOpacity.setValue(1)
      Animated.sequence([
        Animated.timing(saveAnim, { toValue: 1.2, duration: 150, useNativeDriver: true }),
        Animated.spring(saveAnim, { toValue: 1, useNativeDriver: true, tension: 100, friction: 8 }),
      ]).start()
      Animated.sequence([
        Animated.delay(800),
        Animated.timing(savedTextOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]).start(() => setShowSavedText(false))
    }
  }, [wordSaved])

  const stage = vocabStage != null ? STAGE_LABELS[vocabStage] : null
  const translateY = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [80, 0] })

  return (
    <Animated.View style={[
      styles.container,
      { backgroundColor: colors.surface, borderColor: colors.border, transform: [{ translateY }], opacity: slideAnim },
    ]}>
      {/* Level 1: Word + translation + save */}
      <TouchableOpacity activeOpacity={0.9} onPress={() => setExpanded(!expanded)} style={styles.mainRow}>
        <View style={styles.wordCol}>
          <View style={styles.wordRow}>
            <Text style={[styles.word, { color: colors.text }]}>{word}</Text>
            {stage && (
              <View style={[styles.stageBadge, { backgroundColor: stage.color + '20', borderColor: stage.color + '40' }]}>
                <Text style={[styles.stageBadgeText, { color: stage.color }]}>{stage.label}</Text>
              </View>
            )}
          </View>
          {translating ? (
            <ActivityIndicator size="small" color={colors.textSecondary} style={{ alignSelf: 'flex-start', marginTop: 2 }} />
          ) : translation ? (
            <Text style={[styles.translation, { color: colors.textSecondary }]} numberOfLines={1}>{translation}</Text>
          ) : null}
        </View>

        {/* TTS button */}
        <TouchableOpacity style={styles.iconBtn} onPress={onSpeak}>
          <Ionicons name={isSpeaking ? 'stop' : 'volume-high-outline'} size={20} color={colors.primary} />
        </TouchableOpacity>

        {/* Save / Stage action */}
        {isAuthenticated && (
          <Animated.View style={{ transform: [{ scale: saveAnim }] }}>
            {wordSaved ? (
              <View style={[styles.savedBtn, { backgroundColor: '#10B981' }]}>
                <Ionicons name="checkmark" size={16} color="#fff" />
              </View>
            ) : stage ? (
              stage.label !== '✓' && onMarkKnown ? (
                <TouchableOpacity style={[styles.saveBtn, { backgroundColor: '#22c55e' }]} onPress={onMarkKnown}>
                  <Ionicons name="checkmark-done" size={16} color="#fff" />
                </TouchableOpacity>
              ) : null
            ) : (
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: '#10B981' }]} onPress={onSave}>
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        )}
      </TouchableOpacity>

      {/* "Saved!" confirmation text with session count */}
      {showSavedText && (
        <Animated.Text style={[styles.savedText, { color: '#10B981', opacity: savedTextOpacity }]}>
          {sessionWordCount > 1 ? `${sessionWordCount} words saved this session` : 'Saved!'}
        </Animated.Text>
      )}

      {/* Level 2: Expanded — highlights + dictionary + actions */}
      {expanded && (
        <View style={[styles.expandedSection, { borderTopColor: colors.border }]}>
          {/* Highlight colors */}
          {isAuthenticated && onHighlight && (
            <View style={styles.highlightRow}>
              <Text style={[styles.expandLabel, { color: colors.textSecondary }]}>Highlight</Text>
              {HIGHLIGHT_COLORS.map(h => (
                <TouchableOpacity
                  key={h.key}
                  style={[styles.colorBtn, { backgroundColor: h.color }]}
                  onPress={() => onHighlight(h.key)}
                />
              ))}
            </View>
          )}

          {/* Action buttons */}
          <View style={styles.actionsRow}>
            <TouchableOpacity style={[styles.actionBtn, { borderColor: colors.border }]} onPress={onDictionary}>
              <Ionicons name="book-outline" size={16} color={colors.text} />
              <Text style={[styles.actionBtnText, { color: colors.text }]}>Dictionary</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { borderColor: colors.border }]} onPress={onDismiss}>
              <Ionicons name="close-outline" size={16} color={colors.textSecondary} />
              <Text style={[styles.actionBtnText, { color: colors.textSecondary }]}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 5,
    overflow: 'hidden',
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
  },
  wordCol: {
    flex: 1,
    gap: 2,
  },
  wordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  word: {
    fontFamily: fonts.sansBold,
    fontSize: 17,
  },
  translation: {
    fontFamily: fonts.sans,
    fontSize: 14,
    marginTop: 1,
  },
  stageBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
  },
  stageBadgeText: {
    fontSize: 10,
    fontFamily: fonts.sansMedium,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  saveBtnText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: '#fff',
  },
  savedBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    textAlign: 'center',
    paddingBottom: 6,
  },
  // Expanded section (Level 2)
  expandedSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  highlightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  expandLabel: {
    fontFamily: fonts.sans,
    fontSize: 12,
    marginRight: 2,
  },
  colorBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionBtnText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
  },
})
