import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { Ionicons } from '@expo/vector-icons'
import { cachedTranslate, peekTranslation, type SaveCategory } from '../lib/translateCache'
import { useTheme } from '../context/ThemeContext'
import { useTargetLanguage } from '../hooks/useTargetLanguage'
import { fonts } from '../theme/typography'

const STAGE_LABELS: Record<number, { label: string; color: string }> = {
  0: { label: 'New', color: '#3b82f6' },
  1: { label: '★1', color: '#eab308' },
  2: { label: '★2', color: '#eab308' },
  3: { label: '★3', color: '#22c55e' },
  4: { label: '✓', color: '#22c55e' },
}

const HIGHLIGHT_FILLS: Record<string, string> = {
  yellow: '#fef08a',
  green: '#bbf7d0',
  pink: '#fbcfe8',
  blue: '#bfdbfe',
}

export type HighlightColorKey = 'yellow' | 'green' | 'pink' | 'blue'

interface SelectionActionBarProps {
  selectedText: string
  isMultiWord: boolean
  /** Source language code — used for fetching the inline translation
   *  when a single word is tapped. Same value the reader passes to TTS. */
  language?: string
  onTranslate: () => void
  onExplain?: () => void
  onSpeak: () => void
  onSaveWord: () => void
  onHighlight?: (color: HighlightColorKey) => void
  /** Last color the user picked — used as the single highlight button's
   *  fill. Tapping commits this color; change via HighlightNoteModal after. */
  highlightColor?: HighlightColorKey
  onMarkKnown?: () => void
  /** Remove the word from vocabulary — lets the user undo an accidental save. */
  onRemove?: () => void
  isSpeaking?: boolean
  wordSaved?: boolean
  vocabStage?: number | null
  isAuthenticated?: boolean
  /** Distance from bottom — typically reader footer height. */
  bottomOffset?: number
  /** Dismiss the toolbar. The reader passes `() => setSelection(null)` so an
   *  accidental tap on the screen doesn't strand the toolbar (B-?? mobile
   *  bug sweep). Optional for back-compat with screens that haven't wired
   *  it yet — those just lose the close affordance. */
  onClose?: () => void
}

/**
 * Single bottom toolbar for any selection. Mode is derived from
 * `isMultiWord`:
 *
 *   - single word  → shows the inline translation above the row,
 *                    plus per-word actions (save / mark-known)
 *   - multi-word   → just the action row; translation lives in
 *                    the TranslationSheet behind the Translate button
 *
 * The highlight palette collapsed into one button (matches Apple Books /
 * Kindle). Color change happens in HighlightNoteModal after the
 * highlight is created.
 */
export function SelectionActionBar({
  selectedText,
  isMultiWord,
  language,
  onTranslate,
  onExplain,
  onSpeak,
  onSaveWord,
  onHighlight,
  highlightColor = 'yellow',
  onMarkKnown,
  onRemove,
  isSpeaking,
  wordSaved,
  vocabStage,
  isAuthenticated,
  bottomOffset = 0,
  onClose,
}: SelectionActionBarProps) {
  const { colors } = useTheme()
  const { fromLang, toLang } = useTargetLanguage(language)
  const isSameLang = fromLang === toLang

  // Inline translation for single-word taps. Fetched here (was in the
  // deleted WordCard). Cancellation guard avoids stale results when the
  // user re-taps mid-fetch.
  const [translation, setTranslation] = useState('')
  const [translating, setTranslating] = useState(false)
  // Backend frequency hint for the tapped word — drives Save-button emphasis.
  const [category, setCategory] = useState<SaveCategory | undefined>(undefined)
  useEffect(() => {
    if (isMultiWord || !selectedText || isSameLang) {
      setTranslation('')
      setTranslating(false)
      setCategory(undefined)
      return
    }
    // Instant render on a cache hit (re-tap of a seen word) — no spinner.
    const cached = peekTranslation(selectedText, fromLang, toLang)
    if (cached !== undefined) {
      setTranslation(cached.translation)
      setCategory(cached.category)
      setTranslating(false)
      return
    }
    let cancelled = false
    setTranslation('')
    setCategory(undefined)
    setTranslating(true)
    cachedTranslate(selectedText, fromLang, toLang)
      .then((r) => { if (!cancelled) { setTranslation(r.translation); setCategory(r.category) } })
      .catch(() => { if (!cancelled) setTranslation('') })
      .finally(() => { if (!cancelled) setTranslating(false) })
    return () => { cancelled = true }
  }, [selectedText, isMultiWord, fromLang, toLang, isSameLang])

  const handleCopy = () => {
    if (selectedText) Clipboard.setStringAsync(selectedText)
  }

  const stage = !isMultiWord && vocabStage != null ? STAGE_LABELS[vocabStage] : null
  const highlightFill = HIGHLIGHT_FILLS[highlightColor] || HIGHLIGHT_FILLS.yellow

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          bottom: bottomOffset,
        },
      ]}
    >
      {/* Translation row — only for single-word taps. Keeps the killer
          feature from the old WordCard (zero-tap to see translation). */}
      {!isMultiWord && !isSameLang && (
        <View style={styles.translationRow}>
          <Text style={[styles.word, { color: colors.textSecondary }]} numberOfLines={1}>
            {selectedText}
          </Text>
          <Ionicons name="arrow-forward" size={12} color={colors.textSecondary} />
          {translating ? (
            <ActivityIndicator size="small" color={colors.textSecondary} />
          ) : (
            <Text style={[styles.translation, { color: colors.text }]} numberOfLines={1}>
              {translation || '—'}
            </Text>
          )}
        </View>
      )}

      <View style={styles.actionsRow}>
        {isAuthenticated && onHighlight && (
          <>
            <TouchableOpacity
              style={[styles.highlightBtn, { backgroundColor: highlightFill }]}
              onPress={() => onHighlight(highlightColor)}
              accessibilityRole="button"
              accessibilityLabel={`Highlight in ${highlightColor} (tap to change color in the note editor)`}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
          </>
        )}

        <TouchableOpacity
          style={styles.btn}
          onPress={handleCopy}
          accessibilityRole="button"
          accessibilityLabel="Copy selection"
        >
          <Ionicons name="copy-outline" size={20} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.btn}
          onPress={onTranslate}
          accessibilityRole="button"
          accessibilityLabel="Translate selection in full sheet"
        >
          <Ionicons name="language-outline" size={20} color={colors.text} />
        </TouchableOpacity>
        {onExplain && (
          <TouchableOpacity
            style={styles.btn}
            onPress={onExplain}
            accessibilityRole="button"
            accessibilityLabel="Explain selection in context"
          >
            <Ionicons name="bulb-outline" size={20} color={colors.text} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.btn}
          onPress={onSpeak}
          accessibilityRole="button"
          accessibilityLabel={isSpeaking ? 'Stop speech' : 'Read selection aloud'}
          accessibilityState={{ selected: !!isSpeaking }}
        >
          <Ionicons name={isSpeaking ? 'stop' : 'volume-high-outline'} size={20} color={colors.text} />
        </TouchableOpacity>

        {/* Per-word vocab affordances (save / mark known / stage badge) */}
        {isAuthenticated && !isMultiWord && (
          <>
            {stage && (
              <View
                style={[styles.stageBadge, { backgroundColor: stage.color + '20', borderColor: stage.color + '40' }]}
                accessibilityLabel={`Vocabulary stage ${stage.label}`}
              >
                <Text style={[styles.stageBadgeText, { color: stage.color }]}>{stage.label}</Text>
              </View>
            )}
            {stage && vocabStage !== 4 && onMarkKnown && (
              <TouchableOpacity
                style={styles.btn}
                onPress={onMarkKnown}
                accessibilityRole="button"
                accessibilityLabel="Mark word as known"
              >
                <Ionicons name="checkmark-done" size={20} color="#22c55e" />
              </TouchableOpacity>
            )}
            {/* Transient ✓ right after a save lands (before the stage badge
                takes over on next render). */}
            {!stage && wordSaved && (
              <View style={styles.btn} accessibilityLabel="Saved to vocabulary">
                <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              </View>
            )}
            {/* Manual save — tap = look, this commits. Tint is a frequency
                RECOMMENDATION (learnable/rare = accent, common = muted), never
                a gate: any word can still be saved. */}
            {!stage && !wordSaved && onSaveWord && (
              <TouchableOpacity
                style={styles.btn}
                onPress={onSaveWord}
                accessibilityRole="button"
                accessibilityLabel={category === 'rare' ? 'Save word to vocabulary (rare word)' : 'Save word to vocabulary'}
              >
                <Ionicons
                  name="add-circle"
                  size={24}
                  color={category === 'common' ? colors.textSecondary : (category ? colors.success : colors.text)}
                />
              </TouchableOpacity>
            )}
            {/* Remove — undo an accidental save. */}
            {(stage || wordSaved) && onRemove && (
              <TouchableOpacity
                style={styles.btn}
                onPress={onRemove}
                accessibilityRole="button"
                accessibilityLabel="Remove word from vocabulary"
              >
                <Ionicons name="trash-outline" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </>
        )}

        {onClose && (
          <>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <TouchableOpacity
              style={styles.btn}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close selection toolbar"
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    // Floating selection toolbar — pinned above the reader footer so it's
    // not occluded by progress chrome. `bottom` is set inline from prop.
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  translationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: 6,
    marginBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(127,127,127,0.18)',
  },
  word: {
    fontFamily: fonts.serifItalic,
    fontSize: 14,
    maxWidth: '40%',
  },
  translation: {
    fontFamily: fonts.serif,
    fontSize: 15,
    maxWidth: '55%',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  highlightBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.15)',
  },
  divider: {
    width: 1,
    height: 22,
    marginHorizontal: 6,
  },
  stageBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
  },
  stageBadgeText: {
    fontSize: 11,
    fontFamily: fonts.sansMedium,
  },
})
