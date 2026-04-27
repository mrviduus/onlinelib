import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../context/ThemeContext'
import { useLanguage } from '../../context/LanguageContext'
import { fonts } from '../../theme/typography'

interface Props {
  value: string
  onChange: (next: string) => void
  onClear: () => void
}

export function LibrarySearch({ value, onChange, onClear }: Props) {
  const { colors } = useTheme()
  const { t } = useLanguage()
  return (
    <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Ionicons name="search" size={18} color={colors.textSecondary} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={t('library.search.placeholder')}
        placeholderTextColor={colors.textSecondary}
        style={[styles.input, { color: colors.text, fontFamily: fonts.sans }]}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="never"
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={onClear} hitSlop={8} accessibilityLabel={t('library.search.clear')}>
          <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 14,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  input: { flex: 1, fontSize: 14, paddingVertical: 0 },
})
