import { useState, useEffect, useRef, useCallback } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Animated, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { translationApi, dictionaryApi } from '@textstack/shared'
import { useTheme } from '../context/ThemeContext'
import { useNativeLanguage } from '../context/NativeLanguageContext'
import { useTargetLanguage } from '../hooks/useTargetLanguage'
import { getLanguage } from '../data/languages'
import { LanguagePickerModal } from './LanguagePickerModal'
import { RareWordNotice } from './reader/RareWordNotice'
import { fonts } from '../theme/typography'

const STAGE_LABELS: Record<number, { label: string; color: string }> = {
  0: { label: 'New', color: '#3b82f6' },
  1: { label: '★1', color: '#eab308' },
  2: { label: '★2', color: '#eab308' },
  3: { label: '★3', color: '#22c55e' },
  4: { label: '✓', color: '#22c55e' },
}

// Auto-dismiss timing — parity with web WordPopup. Scale by content length so
// a 16-word definition gets more read-time than a 1-word translation. Rare
// words get a longer fallback (decision time + body is longer).
const AUTO_DISMISS_MS_MIN = 3000
const AUTO_DISMISS_MS_MAX = 8000
const AUTO_DISMISS_MS_PER_WORD = 350
const LOOKUP_AUTO_DISMISS_MS = 20000
const CJK_RE = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/g

function computeDismissMs(translation: string, definition: string | null): number {
  const text = `${translation} ${definition ?? ''}`.trim()
  if (!text) return AUTO_DISMISS_MS_MIN
  const cjkChars = (text.match(CJK_RE) || []).length
  const nonCjk = text.replace(CJK_RE, ' ')
  const words = nonCjk.split(/\s+/).filter(Boolean).length
  const units = words + cjkChars
  return Math.min(AUTO_DISMISS_MS_MAX, Math.max(AUTO_DISMISS_MS_MIN, units * AUTO_DISMISS_MS_PER_WORD))
}

interface WordCardProps {
  word: string
  /**
   * Monotonic id per selection *event* — lets useEffect reset the
   * auto-dismiss timer even when the word text is unchanged (B-12).
   * Without this, rapid re-taps on the same word kept the original 3s
   * timer running, often causing the card to vanish mid-interaction.
   */
  selectionId?: number
  onSave: () => void
  onSpeak: () => void
  /**
   * Optional: called when the user taps "Ignore" on an already-saved word —
   * removes the word from vocabulary. Only rendered when `wordSaved` is true
   * AND this callback is provided. Matches web WordPopup parity (B-79).
   */
  onRemove?: () => void
  onMarkKnown?: () => void
  onDismiss: () => void
  isSpeaking?: boolean
  wordSaved?: boolean
  vocabStage?: number | null
  isAuthenticated?: boolean
  /**
   * Book/reading language — used as the translation source. The target
   * language (user's native, or a sensible fallback) is resolved inside
   * via `useTargetLanguage()`. Kept named `language` for call-site
   * back-compat with the reader screen.
   */
  language?: string
  sessionWordCount?: number
  /**
   * Pixels to lift the card above the bottom edge. Typically the reader's
   * footer height (including safe-area inset) so the card floats cleanly
   * above the progress bar instead of being hidden by it.
   */
  bottomOffset?: number
  /**
   * When the backend classifies the tap as a rare word (F1 anti-spiral),
   * we render a `RareWordNotice` and let the user escalate via Add-anyway.
   * Null outside lookup/lookup_pending outcomes.
   */
  lookupState?: { kind: 'lookup' | 'lookup_pending'; tapsRemaining: number | null; busy: boolean } | null
  onAddAnyway?: () => void
}

export function WordCard({
  word, selectionId = 0, onSave, onSpeak, onRemove, onMarkKnown,
  onDismiss, isSpeaking, wordSaved, vocabStage, isAuthenticated, language,
  sessionWordCount = 0, bottomOffset = 0, lookupState = null, onAddAnyway,
}: WordCardProps) {
  const { colors } = useTheme()
  const { nativeLanguage, setNativeLanguage } = useNativeLanguage()
  const { fromLang, toLang } = useTargetLanguage(language)
  const [translation, setTranslation] = useState('')
  const [translating, setTranslating] = useState(true)
  const [phonetic, setPhonetic] = useState<string | null>(null)
  const [definition, setDefinition] = useState<string | null>(null)
  const [definitionLoading, setDefinitionLoading] = useState(true)
  const [showLangPicker, setShowLangPicker] = useState(false)
  const [showSavedText, setShowSavedText] = useState(false)
  const slideAnim = useRef(new Animated.Value(0)).current
  const saveAnim = useRef(new Animated.Value(1)).current
  const savedTextOpacity = useRef(new Animated.Value(0)).current
  const dismissTimerRef = useRef<NodeJS.Timeout | number | null>(null)

  const cancelAutoDismiss = useCallback(() => {
    if (dismissTimerRef.current != null) clearTimeout(dismissTimerRef.current as number)
  }, [])

  // Auto-dismiss after 3s unless user interacts. Reset the timer on every
  // selection event (not just word changes) — otherwise tapping the same
  // word twice lets the original timer fire mid-interaction (B-12).
  //
  // When the lang picker is open we cancel this so the user isn't chased
  // off the card while choosing a language.
  // Deps intentionally omit `translation` / `definition` — their values are
  // read inside the effect body when the timer arms. Streaming updates would
  // otherwise thrash the timer. Instead we re-trigger on loading → done
  // transition via `translating` + `definitionLoading`, and on object-identity
  // toggles (`!!lookupState`) rather than the whole object so busy-flips don't
  // re-arm the 20s timer.
  useEffect(() => {
    if (showLangPicker) return
    if (translating || definitionLoading) return
    const ms = lookupState ? LOOKUP_AUTO_DISMISS_MS : computeDismissMs(translation, definition)
    if (__DEV__) console.log('[diag] WordCard timer arm', word, selectionId, ms + 'ms')
    dismissTimerRef.current = setTimeout(() => {
      if (__DEV__) console.log('[diag] WordCard auto-dismiss fired', word)
      onDismiss()
    }, ms)
    return () => {
      if (__DEV__) console.log('[diag] WordCard effect cleanup', word, selectionId)
      if (dismissTimerRef.current != null) clearTimeout(dismissTimerRef.current as number)
    }
  }, [word, selectionId, showLangPicker, !!lookupState, translating, definitionLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (__DEV__) console.log('[diag] WordCard MOUNT', word)
    return () => { if (__DEV__) console.log('[diag] WordCard UNMOUNT', word) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch translation on mount. Source/target come from useTargetLanguage —
  // previously the pair was hardcoded en↔uk which broke for users reading
  // non-English books or whose native language isn't Ukrainian (B-07).
  //
  // Cancellation flag: rapid re-taps on different words could land the
  // first response after the second — overwriting the current translation
  // with stale text (B-72). The cancelled-check before each setState
  // prevents that without aborting the underlying request.
  useEffect(() => {
    let cancelled = false
    setTranslation('')
    setTranslating(true)
    translationApi.translate(word, fromLang, toLang)
      .then((res: { translatedText?: string; translation?: string }) => {
        if (cancelled) return
        setTranslation(res.translatedText || res.translation || '')
      })
      .catch(e => {
        if (cancelled) return
        console.warn('Translate failed:', e)
        setTranslation('')
      })
      .finally(() => {
        if (!cancelled) setTranslating(false)
      })
    return () => { cancelled = true }
  }, [word, fromLang, toLang])

  // Dictionary lookup for phonetic + inline definition (B-79). Previously
  // both lived in `DictionarySheet` behind an extra tap — web parity needs
  // them inline. Cancellation flag guards against rapid re-taps landing a
  // stale entry on the new word. Errors are swallowed quietly (many words
  // just aren't in the dictionary — 404 is expected, not a real failure).
  useEffect(() => {
    let cancelled = false
    setPhonetic(null)
    setDefinition(null)
    setDefinitionLoading(true)
    dictionaryApi.lookupWord(fromLang, word)
      .then(entry => {
        if (cancelled) return
        setPhonetic(entry.phonetic?.trim() || null)
        const first = entry.meanings?.[0]
        const def = first?.definitions?.[0]?.definition || null
        const pos = first?.partOfSpeech
        setDefinition(def ? (pos ? `(${pos}) ${def}` : def) : null)
      })
      .catch(() => {
        // Silent — 404 (word not in dict) is the normal case.
      })
      .finally(() => {
        if (!cancelled) setDefinitionLoading(false)
      })
    return () => { cancelled = true }
  }, [word, fromLang])

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
  const isSameLang = fromLang === toLang
  const nativeLabel = getLanguage(toLang)?.nativeName || toLang
  const footerLabel = isSameLang
    ? `Looking up definition`
    : `Translating to ${nativeLabel}`

  return (
    <>
      <Animated.View style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          bottom: bottomOffset + 8,
          transform: [{ translateY }],
          opacity: slideAnim,
        },
      ]}>
        {/* Header: word + phonetic + close */}
        <View style={styles.header}>
          <View style={styles.headerWordRow}>
            <Text style={[styles.word, { color: colors.text }]} numberOfLines={1}>
              {word}
            </Text>
            {phonetic && (
              <Text
                style={[styles.phonetic, { color: colors.textSecondary }]}
                numberOfLines={1}
                accessibilityLabel={`pronunciation ${phonetic}`}
              >
                {phonetic}
              </Text>
            )}
            {stage && (
              <View style={[styles.stageBadge, { backgroundColor: stage.color + '20', borderColor: stage.color + '40' }]}>
                <Text style={[styles.stageBadgeText, { color: stage.color }]}>{stage.label}</Text>
              </View>
            )}
          </View>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => { cancelAutoDismiss(); onDismiss() }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close word card"
          >
            <Ionicons name="close" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Translation — primary content, brand accent (dark-mode aware) */}
        {(translating || translation) && (
          <View style={styles.translationRow}>
            {translating ? (
              <ActivityIndicator
                size="small"
                color={colors.textSecondary}
                accessibilityLabel="Translating"
              />
            ) : (
              <Text style={[styles.translation, { color: colors.primary }]} numberOfLines={3}>
                {translation}
              </Text>
            )}
          </View>
        )}

        {/* Definition — secondary content, fills the information role that
            used to require opening DictionarySheet (B-79). */}
        {(definitionLoading || definition) && (
          <View style={styles.definitionRow}>
            {definitionLoading ? (
              <ActivityIndicator
                size="small"
                color={colors.textSecondary}
                accessibilityLabel="Loading definition"
              />
            ) : definition ? (
              <Text style={[styles.definition, { color: colors.text }]} numberOfLines={4}>
                {definition}
              </Text>
            ) : null}
          </View>
        )}

        {/* Rare-word notice (F1 anti-spiral) — shown when backend classified the
            tap as `lookup` / `lookup_pending`. Save CTA below is suppressed. */}
        {lookupState && onAddAnyway && (
          <RareWordNotice
            kind={lookupState.kind}
            tapsRemaining={lookupState.tapsRemaining}
            busy={lookupState.busy}
            onAddAnyway={() => { cancelAutoDismiss(); onAddAnyway() }}
          />
        )}

        {/* Actions: TTS + saved status + Ignore / Save + MarkKnown */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => { cancelAutoDismiss(); onSpeak() }}
            accessibilityRole="button"
            accessibilityLabel={isSpeaking ? 'Stop speaking' : 'Speak word'}
            accessibilityState={{ selected: !!isSpeaking }}
          >
            <Ionicons
              name={isSpeaking ? 'stop' : 'volume-high-outline'}
              size={20}
              color={colors.primary}
            />
          </TouchableOpacity>

          {isAuthenticated && wordSaved && (
            <Animated.View style={[styles.savedStatus, { transform: [{ scale: saveAnim }] }]}>
              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
              <Text style={[styles.savedStatusText, { color: '#10B981' }]}>
                Saved to vocabulary
              </Text>
            </Animated.View>
          )}

          <View style={{ flex: 1 }} />

          {/* Ignore (remove saved word) — parity with web's delete_outline btn */}
          {isAuthenticated && wordSaved && onRemove && (
            <TouchableOpacity
              style={[styles.ghostBtn, { borderColor: colors.border }]}
              onPress={() => { cancelAutoDismiss(); onRemove() }}
              accessibilityRole="button"
              accessibilityLabel="Ignore word"
            >
              <Ionicons name="trash-outline" size={14} color={colors.textSecondary} />
              <Text style={[styles.ghostBtnText, { color: colors.textSecondary }]}>
                Ignore
              </Text>
            </TouchableOpacity>
          )}

          {/* Save CTA (when unsaved + no stage). Suppressed while the
              RareWordNotice is showing — user uses "Add anyway" instead. */}
          {isAuthenticated && !wordSaved && !stage && !lookupState && (
            <Animated.View style={{ transform: [{ scale: saveAnim }] }}>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: '#10B981' }]}
                onPress={() => { cancelAutoDismiss(); onSave() }}
                accessibilityRole="button"
                accessibilityLabel="Save word to vocabulary"
              >
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Mark-known (when already in SRS pool but not mastered) */}
          {isAuthenticated && !wordSaved && stage && stage.label !== '✓' && onMarkKnown && (
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: '#22c55e' }]}
              onPress={() => { cancelAutoDismiss(); onMarkKnown() }}
              accessibilityRole="button"
              accessibilityLabel="Mark word as known"
            >
              <Ionicons name="checkmark-done" size={16} color="#fff" />
              <Text style={styles.saveBtnText}>Known</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Saved-this-session counter fade (after save action) */}
        {showSavedText && sessionWordCount > 1 && (
          <Animated.Text style={[styles.sessionCount, { color: '#10B981', opacity: savedTextOpacity }]}>
            {sessionWordCount} words saved this session
          </Animated.Text>
        )}

        {/* Language footer — "Translating to X · Change" */}
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <Text style={[styles.footerLabel, { color: colors.textSecondary }]} numberOfLines={1}>
            {footerLabel}
          </Text>
          <TouchableOpacity
            style={styles.changeBtn}
            onPress={() => { cancelAutoDismiss(); setShowLangPicker(true) }}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Change target language"
          >
            <Text style={[styles.changeBtnText, { color: colors.primary }]}>
              Change
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      <LanguagePickerModal
        visible={showLangPicker}
        onClose={() => setShowLangPicker(false)}
        value={nativeLanguage}
        onChange={(code) => setNativeLanguage(code)}
      />
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    // Floating card — positioned above the reader footer via `bottom` prop
    // computed at render time from the parent's footerHeight. maxWidth caps
    // card width on tablets so it reads as a focused popup, not a full-width
    // bar. alignSelf centering on absolute positioning works in RN when
    // left+right are both 0 — the OS centers a maxWidth-constrained child.
    position: 'absolute',
    left: 0,
    right: 0,
    marginHorizontal: 12,
    maxWidth: 420,
    alignSelf: 'center',
    zIndex: 20,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 5,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 2,
    gap: 8,
  },
  headerWordRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: 8,
  },
  word: {
    fontFamily: fonts.sansBold,
    fontSize: 18,
  },
  phonetic: {
    fontFamily: fonts.sans,
    fontSize: 13,
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
  closeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  translationRow: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 4,
  },
  translation: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
  },
  definitionRow: {
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 8,
  },
  definition: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  savedStatusText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
  },
  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  ghostBtnText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
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
  sessionCount: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    textAlign: 'center',
    paddingBottom: 6,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 8,
  },
  footerLabel: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 12,
  },
  changeBtn: {
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  changeBtnText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
  },
})
