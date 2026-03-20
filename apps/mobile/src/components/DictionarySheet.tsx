import { useState, useEffect } from 'react'
import { View, Text, Modal, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { dictionaryApi } from '@textstack/shared'
import { useTheme } from '../context/ThemeContext'
import { fonts } from '../theme/typography'

interface DictionaryEntry {
  word: string
  phonetic?: string
  meanings: Array<{
    partOfSpeech: string
    definitions: Array<{ definition: string; example?: string }>
  }>
}

interface DictionarySheetProps {
  visible: boolean
  word: string
  onClose: () => void
  onSpeak: (text: string) => void
}

export function DictionarySheet({ visible, word, onClose, onSpeak }: DictionarySheetProps) {
  const { colors } = useTheme()
  const [entry, setEntry] = useState<DictionaryEntry | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!visible || !word) return
    setLoading(true)
    setError('')
    setEntry(null)
    dictionaryApi.lookupWord('en', word)
      .then((data: any) => {
        if (Array.isArray(data) && data.length > 0) {
          setEntry(data[0])
        } else if (data?.word) {
          setEntry(data)
        } else {
          setError('No definition found')
        }
      })
      .catch(() => setError('Failed to load definition'))
      .finally(() => setLoading(false))
  }, [visible, word])

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginTop: 12 }} />
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={styles.headerLeft}>
              <Text style={[styles.word, { color: colors.text }]}>{word}</Text>
              {entry?.phonetic && <Text style={[styles.phonetic, { color: colors.textSecondary }]}>{entry.phonetic}</Text>}
            </View>
            <View style={styles.headerRight}>
              <TouchableOpacity style={styles.speakBtn} onPress={() => onSpeak(word)}>
                <Ionicons name="volume-high-outline" size={22} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView style={styles.body}>
            {loading && <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />}
            {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
            {entry?.meanings?.map((m, i) => (
              <View key={i} style={styles.meaningBlock}>
                <Text style={[styles.pos, { color: colors.primary }]}>{m.partOfSpeech}</Text>
                {m.definitions.slice(0, 4).map((d, j) => (
                  <View key={j} style={styles.defRow}>
                    <Text style={[styles.defNum, { color: colors.textSecondary }]}>{j + 1}.</Text>
                    <View style={styles.defContent}>
                      <Text style={[styles.defText, { color: colors.text }]}>{d.definition}</Text>
                      {d.example && <Text style={[styles.example, { color: colors.textSecondary }]}>"{d.example}"</Text>}
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>
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
    maxHeight: '60%',
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  headerLeft: { flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  word: { fontSize: 22, fontFamily: fonts.sansBold },
  phonetic: { fontSize: 14, marginTop: 2 },
  speakBtn: { padding: 4 },
  body: { padding: 16 },
  error: { textAlign: 'center', marginTop: 16 },
  meaningBlock: { marginBottom: 16 },
  pos: {
    fontSize: 13,
    fontFamily: fonts.sansBold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  defRow: { flexDirection: 'row', marginBottom: 8 },
  defNum: { fontSize: 14, width: 20 },
  defContent: { flex: 1 },
  defText: { fontSize: 15, lineHeight: 22 },
  example: { fontSize: 13, fontStyle: 'italic', marginTop: 4 },
})
