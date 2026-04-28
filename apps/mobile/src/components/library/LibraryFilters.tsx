import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native'
import { useTheme } from '../../context/ThemeContext'
import { useLanguage } from '../../context/LanguageContext'
import { fonts } from '../../theme/typography'
import type { LibraryFilterKey } from '../../hooks/useLibraryFilter'

const ORDER: LibraryFilterKey[] = ['all', 'reading', 'finished', 'notStarted', 'failed']

interface Props {
  value: LibraryFilterKey
  onChange: (next: LibraryFilterKey) => void
  counts: Record<LibraryFilterKey, number>
}

export function LibraryFilters({ value, onChange, counts }: Props) {
  const { colors } = useTheme()
  const { t } = useLanguage()
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {ORDER.map(key => {
        if (key === 'failed' && counts.failed === 0) return null
        const active = value === key
        return (
          <TouchableOpacity
            key={key}
            onPress={() => onChange(key)}
            style={[
              styles.chip,
              { borderColor: active ? colors.text : colors.border, backgroundColor: active ? colors.text : 'transparent' },
            ]}
            hitSlop={6}
          >
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: active ? colors.background : colors.textSecondary }}>
              {t(`library.filter.${key}`)}
            </Text>
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: 11, color: active ? colors.background : colors.textSecondary, opacity: 0.7 }}>
              {counts[key]}
            </Text>
          </TouchableOpacity>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 14, paddingVertical: 8, gap: 6 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    borderWidth: 1,
  },
})
