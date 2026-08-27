import { useState, useEffect } from 'react'
import { View, Text, Modal, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { translationApi } from '@textstack/shared'
import { useTheme } from '../context/ThemeContext'
import { useTargetLanguage } from '../hooks/useTargetLanguage'
import { getLanguage } from '../data/languages'
import { fonts } from '../theme/typography'
import { trackTranslationUsed } from '../lib/analytics'

interface TranslationSheetProps {
  visible: boolean
  text: string
  onClose: () => void
  onSpeak: (text: string) => void
  /**
   * Override the source language (book language). Falls back to the UI
   * reading language from `useLanguage()` when omitted.
   */
  fromLang?: string
}

export function TranslationSheet({ visible, text, onClose, onSpeak, fromLang: fromOverride }: TranslationSheetProps) {
  const { colors } = useTheme()
  const { fromLang, translationTarget } = useTargetLanguage(fromOverride)
  // Human-readable native labels for the sheet header. Fall back to the
  // uppercased language code (e.g. "EN") when the code isn't in our
  // catalogue — no throw, no blank space.
  const label = (code: string) => getLanguage(code)?.nativeName ?? code.toUpperCase()
  const fromLabel = label(fromLang)
  const toLabel = translationTarget ? label(translationTarget) : null
  const [translated, setTranslated] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // Nothing to translate into: the reader knows this language. Don't spend a
    // request proving that English means English — the sheet says so instead.
    if (!visible || !text || !translationTarget) return
    setLoading(true)
    setError('')
    setTranslated('')
    trackTranslationUsed({ fromLang, toLang: translationTarget, kind: text.includes(' ') ? 'selection' : 'word' })
    translationApi.translate(text, fromLang, translationTarget)
      .then((res: any) => {
        setTranslated(res.translatedText || res.translation || '')
      })
      .catch(() => setError('Translation failed'))
      .finally(() => setLoading(false))
  }, [visible, text, fromLang, translationTarget])

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: 12 }} />
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">Translation</Text>
            <TouchableOpacity
              onPress={onClose}
              style={{ padding: 4 }}
              accessibilityRole="button"
              accessibilityLabel="Close translation"
            >
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            <View style={styles.textBlock}>
              <View style={styles.langRow}>
                <Text style={[styles.langLabel, { color: colors.primary }]}>{fromLabel}</Text>
                <TouchableOpacity
                  onPress={() => onSpeak(text)}
                  accessibilityRole="button"
                  accessibilityLabel={`Pronounce in ${fromLabel}`}
                >
                  <Ionicons name="volume-high-outline" size={20} color={colors.primary} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.originalText, { color: colors.text }]}>{text}</Text>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.textBlock}>
              {toLabel ? (
                <>
                  <Text style={[styles.langLabel, { color: colors.primary }]}>{`\u2192 ${toLabel}`}</Text>
                  {loading && <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} accessibilityLabel="Translating" />}
                  {error ? <Text style={{ color: colors.error, marginTop: 8 }} accessibilityRole="alert">{error}</Text> : null}
                  {translated ? <Text style={[styles.translatedText, { color: colors.text }]}>{translated}</Text> : null}
                </>
              ) : (
                <Text style={[styles.translatedText, { color: colors.textSecondary }]}>
                  {`You read ${fromLabel} natively, so there is nothing to translate into. Pick a different language in Profile.`}
                </Text>
              )}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  title: { fontSize: 17, fontFamily: fonts.sansBold },
  body: { padding: 16 },
  textBlock: { marginBottom: 8 },
  langRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  langLabel: {
    fontSize: 12,
    fontFamily: fonts.sansBold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  originalText: { fontSize: 16, lineHeight: 24 },
  divider: {
    height: 1,
    marginVertical: 12,
  },
  translatedText: { fontSize: 16, lineHeight: 24 },
})
