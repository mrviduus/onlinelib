import { useState, useEffect } from 'react'
import { View, Text, Modal, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { explainApi } from '@textstack/shared'
import { useTheme } from '../context/ThemeContext'
import { useTargetLanguage } from '../hooks/useTargetLanguage'
import { fonts } from '../theme/typography'

interface ExplanationSheetProps {
  visible: boolean
  word: string
  sentence: string
  bookId?: string
  fromLang?: string
  onClose: () => void
}

export function ExplanationSheet({ visible, word, sentence, bookId, fromLang: fromOverride, onClose }: ExplanationSheetProps) {
  const { colors } = useTheme()
  const { toLang } = useTargetLanguage(fromOverride)
  const [explanation, setExplanation] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!visible || !word) return
    setLoading(true)
    setError('')
    setExplanation('')
    explainApi.explain({ word, sentence, bookId, targetLang: toLang })
      .then(res => setExplanation(res.explanation))
      .catch(() => setError('Could not generate explanation'))
      .finally(() => setLoading(false))
  }, [visible, word, sentence, toLang, bookId])

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginTop: 12 }} />
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">Explain: {word}</Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }} accessibilityRole="button" accessibilityLabel="Close explanation">
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 16 }}>
            {loading && <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} accessibilityLabel="Generating explanation" />}
            {error ? <Text style={{ color: colors.error, marginTop: 8 }} accessibilityRole="alert">{error}</Text> : null}
            {explanation ? <Text style={[styles.text, { color: colors.text }]}>{explanation}</Text> : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 32, maxHeight: '70%' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1,
  },
  title: { fontSize: 17, fontFamily: fonts.sansBold },
  body: { padding: 16 },
  text: { fontSize: 16, lineHeight: 24 },
})
