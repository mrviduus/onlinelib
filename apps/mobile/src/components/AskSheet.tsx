import { useState, useRef, useEffect, useCallback } from 'react'
import {
  View, Text, Modal, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { ragApi, type AskCitation } from '@textstack/shared'
import { useTheme } from '../context/ThemeContext'
import { useLanguage } from '../context/LanguageContext'
import { fonts } from '../theme/typography'

interface AskTurn {
  question: string
  answer: string
  citations: AskCitation[]
  insufficient: boolean
}

interface AskSheetProps {
  visible: boolean
  editionId?: string
  isAuthenticated: boolean
  onCitation: (citation: AskCitation) => void
  onSignIn: () => void
  onClose: () => void
}

export function AskSheet({
  visible, editionId, isAuthenticated, onCitation, onSignIn, onClose,
}: AskSheetProps) {
  const { colors } = useTheme()
  const { t } = useLanguage()
  const [history, setHistory] = useState<AskTurn[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  const ask = useCallback(async () => {
    const q = input.trim()
    if (!q || !editionId || loading) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    setError('')
    setInput('')
    try {
      const res = await ragApi.ask(editionId, q, undefined, ctrl.signal)
      if (ctrl.signal.aborted) return
      setHistory(prev => [
        ...prev,
        { question: q, answer: res.answer, citations: res.citations, insufficient: res.insufficient },
      ])
    } catch (err) {
      if (ctrl.signal.aborted || (err instanceof Error && err.name === 'AbortError')) return
      setError('Could not get an answer')
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }, [input, editionId, loading])

  const onCitationTap = (c: AskCitation) => {
    onCitation(c)
    onClose()
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={styles.pill} />
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
              {t('reader.ask.title')}
            </Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 16 }}>
            {history.length === 0 && !loading && (
              <Text style={[styles.empty, { color: colors.textSecondary }]}>{t('reader.ask.empty')}</Text>
            )}
            {history.map((turn, i) => (
              <View key={i} style={styles.turn}>
                <Text style={[styles.question, { color: colors.text }]}>{turn.question}</Text>
                <Text style={[styles.answer, { color: colors.text }]}>{turn.answer}</Text>
                {turn.citations.length > 0 && (
                  <View style={styles.citations}>
                    {turn.citations.map(c => (
                      <TouchableOpacity
                        key={c.chunkId}
                        onPress={() => onCitationTap(c)}
                        style={[styles.chip, { borderColor: colors.border }]}
                        accessibilityRole="button"
                      >
                        <Text style={[styles.chipText, { color: colors.text }]}>{`ch.${c.chapterOrd}`}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            ))}
            {loading && (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.primary} />
                <Text style={{ color: colors.textSecondary }}>{t('reader.ask.thinking')}</Text>
              </View>
            )}
            {error ? <Text style={{ color: colors.error, marginTop: 8 }} accessibilityRole="alert">{error}</Text> : null}
          </ScrollView>

          {isAuthenticated ? (
            <View style={[styles.composer, { borderTopColor: colors.border }]}>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                value={input}
                onChangeText={setInput}
                placeholder={t('reader.ask.placeholder')}
                placeholderTextColor={colors.textSecondary}
                multiline
                onSubmitEditing={ask}
              />
              <TouchableOpacity
                onPress={ask}
                disabled={loading || !input.trim()}
                style={[styles.send, { backgroundColor: colors.primary, opacity: loading || !input.trim() ? 0.5 : 1 }]}
                accessibilityRole="button"
              >
                <Text style={styles.sendText}>{t('reader.ask.send')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.composer, { borderTopColor: colors.border }]}>
              <Text style={{ color: colors.textSecondary, flex: 1 }}>{t('reader.ask.signIn')}</Text>
              <TouchableOpacity onPress={onSignIn} style={[styles.send, { backgroundColor: colors.primary }]} accessibilityRole="button">
                <Text style={styles.sendText}>{t('reader.ask.signInCta')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 24, maxHeight: '80%' },
  pill: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginTop: 12 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1,
  },
  title: { fontSize: 17, fontFamily: fonts.sansBold },
  body: { paddingHorizontal: 16, paddingTop: 12 },
  empty: { fontSize: 14, lineHeight: 20 },
  turn: { marginBottom: 16 },
  question: { fontSize: 14, fontFamily: fonts.sansBold, marginBottom: 4 },
  answer: { fontSize: 15, lineHeight: 22 },
  citations: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  chipText: { fontSize: 12 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, borderTopWidth: 1,
  },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, maxHeight: 100, fontSize: 15 },
  send: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  sendText: { color: '#fff', fontFamily: fonts.sansBold, fontSize: 14 },
})
