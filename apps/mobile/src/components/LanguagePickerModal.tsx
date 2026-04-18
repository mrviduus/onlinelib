import { useState, useMemo, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, FlatList, TextInput } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../context/ThemeContext'
import { fonts } from '../theme/typography'
import {
  LANGUAGES,
  POPULAR_LANGUAGES,
  OTHER_LANGUAGES,
  getFlagEmoji,
  type LanguageEntry,
} from '../data/languages'

interface Props {
  visible: boolean
  onClose: () => void
  value: string
  onChange: (code: string) => void
}

type Row =
  | { kind: 'section'; title: string }
  | { kind: 'item'; lang: LanguageEntry }

export function LanguagePickerModal({ visible, onClose, value, onChange }: Props) {
  const { colors } = useTheme()
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!visible) setQuery('')
  }, [visible])

  const rows: Row[] = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      return [
        { kind: 'section', title: 'Popular' },
        ...POPULAR_LANGUAGES.map((lang) => ({ kind: 'item' as const, lang })),
        { kind: 'section', title: 'All languages' },
        ...OTHER_LANGUAGES.map((lang) => ({ kind: 'item' as const, lang })),
      ]
    }
    const filtered = LANGUAGES.filter(
      (l) =>
        l.englishName.toLowerCase().includes(q) ||
        l.nativeName.toLowerCase().includes(q) ||
        l.code.toLowerCase().startsWith(q),
    )
    return filtered.map((lang) => ({ kind: 'item' as const, lang }))
  }, [query])

  const handleSelect = (code: string) => {
    onChange(code)
    onClose()
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.background }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.grabber} />
          <View style={styles.header}>
            <Text
              style={[styles.title, { color: colors.text }]}
              accessibilityRole="header"
            >
              Select language
            </Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close language picker"
            >
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={[styles.searchRow, { borderColor: colors.border }]}>
            <Ionicons name="search" size={18} color={colors.textSecondary} style={{ marginRight: 8 }} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search language..."
              placeholderTextColor={colors.textSecondary}
              style={[styles.searchInput, { color: colors.text, fontFamily: fonts.sans }]}
              autoCorrect={false}
              autoCapitalize="none"
              autoFocus
              accessibilityLabel="Search language"
              returnKeyType="search"
            />
          </View>

          {rows.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              No results for "{query.trim()}"
            </Text>
          ) : (
            <FlatList
              data={rows}
              keyExtractor={(item, i) =>
                item.kind === 'section' ? `section-${item.title}` : `item-${item.lang.code}-${i}`
              }
              keyboardShouldPersistTaps="handled"
              style={styles.list}
              renderItem={({ item }) => {
                if (item.kind === 'section') {
                  return (
                    <Text
                      style={[styles.sectionLabel, { color: colors.textSecondary }]}
                      accessibilityRole="header"
                    >
                      {item.title}
                    </Text>
                  )
                }
                const lang = item.lang
                const selected = lang.code === value
                return (
                  <TouchableOpacity
                    style={[
                      styles.row,
                      { borderBottomColor: colors.border },
                      selected && { backgroundColor: colors.primaryLight },
                    ]}
                    onPress={() => handleSelect(lang.code)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={
                      lang.englishName === lang.nativeName
                        ? lang.nativeName
                        : `${lang.nativeName}, ${lang.englishName}`
                    }
                    accessibilityState={{ selected }}
                  >
                    <Text style={styles.flag}>{getFlagEmoji(lang.code)}</Text>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.rowNative,
                          { color: colors.text, fontFamily: fonts.sansMedium },
                          selected && { color: colors.primary },
                        ]}
                      >
                        {lang.nativeName}
                      </Text>
                      {lang.englishName !== lang.nativeName && (
                        <Text style={[styles.rowEnglish, { color: colors.textSecondary, fontFamily: fonts.sans }]}>
                          {lang.englishName}
                        </Text>
                      )}
                    </View>
                    {selected && <Ionicons name="checkmark" size={20} color={colors.primary} />}
                  </TouchableOpacity>
                )
              }}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
    height: '80%',
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: { fontSize: 17, fontFamily: fonts.sansBold },
  closeBtn: { padding: 4 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 15, padding: 0 },
  list: { flex: 1 },
  sectionLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: fonts.sansMedium,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    gap: 12,
    borderRadius: 4,
  },
  flag: { fontSize: 22 },
  rowNative: { fontSize: 15 },
  rowEnglish: { fontSize: 12, marginTop: 2 },
  empty: { textAlign: 'center', padding: 24, fontSize: 14 },
})
