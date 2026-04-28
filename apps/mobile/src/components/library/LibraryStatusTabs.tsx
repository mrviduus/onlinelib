import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native'
import { useTheme } from '../../context/ThemeContext'
import { useLanguage } from '../../context/LanguageContext'
import { fonts } from '../../theme/typography'
import type { LibraryStatus } from '../../hooks/useLibraryStatus'

const PRIMARY: LibraryStatus[] = ['reading', 'finished', 'notStarted']

interface Props {
  value: LibraryStatus
  onChange: (next: LibraryStatus) => void
  counts: Record<LibraryStatus, number>
}

export function LibraryStatusTabs({ value, onChange, counts }: Props) {
  const { colors } = useTheme()
  const { t } = useLanguage()
  const showFailed = counts.failed > 0

  const renderTab = (key: LibraryStatus, secondary = false) => {
    const active = value === key
    return (
      <TouchableOpacity
        key={key}
        onPress={() => onChange(key)}
        style={[
          styles.tab,
          { borderBottomColor: active ? colors.text : 'transparent' },
          secondary && styles.tabSecondary,
        ]}
        hitSlop={6}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
      >
        <Text
          style={{
            fontFamily: fonts.sansMedium,
            fontSize: secondary ? 12 : 13,
            color: active ? colors.text : colors.textSecondary,
            opacity: secondary && !active ? 0.75 : 1,
          }}
        >
          {t(`library.status.${key}`)}
        </Text>
        <Text
          style={[
            styles.count,
            {
              color: active ? colors.text : colors.textSecondary,
              backgroundColor: colors.surface,
            },
          ]}
        >
          {counts[key]}
        </Text>
      </TouchableOpacity>
    )
  }

  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.primary}
      >
        {PRIMARY.map((k) => renderTab(k, false))}
        {showFailed && renderTab('failed', false)}
      </ScrollView>
      <View style={styles.secondary}>{renderTab('all', true)}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderBottomWidth: 1,
  },
  primary: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  secondary: {
    marginLeft: 'auto',
    paddingLeft: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderBottomWidth: 2,
  },
  tabSecondary: {
    paddingHorizontal: 8,
  },
  count: {
    fontFamily: fonts.sansBold,
    fontSize: 11,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
})
