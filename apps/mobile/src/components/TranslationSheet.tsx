import { useState, useEffect } from 'react'
import { View, Text, Modal, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { translationApi } from '@textstack/shared'
import { useTheme } from '../context/ThemeContext'
import { fonts } from '../theme/typography'

interface TranslationSheetProps {
  visible: boolean
  text: string
  onClose: () => void
  onSpeak: (text: string) => void
}

export function TranslationSheet({ visible, text, onClose, onSpeak }: TranslationSheetProps) {
  const { colors } = useTheme()
  const [translated, setTranslated] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!visible || !text) return
    setLoading(true)
    setError('')
    setTranslated('')
    translationApi.translate(text, 'en', 'uk')
      .then((res: any) => {
        setTranslated(res.translatedText || res.translation || '')
      })
      .catch(() => setError('Translation failed'))
      .finally(() => setLoading(false))
  }, [visible, text])

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginTop: 12 }} />
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]}>Translation</Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            <View style={styles.textBlock}>
              <View style={styles.langRow}>
                <Text style={[styles.langLabel, { color: colors.primary }]}>English</Text>
                <TouchableOpacity onPress={() => onSpeak(text)}>
                  <Ionicons name="volume-high-outline" size={20} color={colors.primary} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.originalText, { color: colors.text }]}>{text}</Text>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.textBlock}>
              <Text style={[styles.langLabel, { color: colors.primary }]}>Українська</Text>
              {loading && <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />}
              {error ? <Text style={{ color: colors.error, marginTop: 8 }}>{error}</Text> : null}
              {translated ? <Text style={[styles.translatedText, { color: colors.text }]}>{translated}</Text> : null}
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
