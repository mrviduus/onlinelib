import { Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native'
import { useTheme } from '../../context/ThemeContext'
import { useLanguage } from '../../context/LanguageContext'
import { fonts } from '../../theme/typography'
import type { LibraryStatus } from '../../hooks/useLibraryStatus'

// "All" leads because it is the default — pinning it to the right meant the
// row clipped mid-word ("Not sta…") against whatever sat beside it, which reads
// as broken rather than scrollable.
const TABS: LibraryStatus[] = ['all', 'reading', 'finished', 'notStarted']

interface Props {
  value: LibraryStatus
  onChange: (next: LibraryStatus) => void
  counts: Record<LibraryStatus, number>
}

export function LibraryStatusTabs({ value, onChange, counts }: Props) {
  const { colors } = useTheme()
  const { t } = useLanguage()
  const showFailed = counts.failed > 0

  const renderTab = (key: LibraryStatus) => {
    const active = value === key
    return (
      <TouchableOpacity
        key={key}
        onPress={() => onChange(key)}
        style={[styles.tab, { borderBottomColor: active ? colors.text : 'transparent' }]}
        hitSlop={6}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
      >
        <Text
          style={{
            fontFamily: fonts.sansMedium,
            fontSize: 13,
            color: active ? colors.text : colors.textSecondary,
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
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
    >
      {TABS.map(renderTab)}
      {showFailed && renderTab('failed')}
    </ScrollView>
  )
}

// Metrics are tight on purpose. The four default tabs plus their counts did not
// fit the ~367dp left beside the view button on a 411dp phone, so "Not started"
// sat half off the edge with its counter invisible — and because the row hides
// its scroll indicator, that reads as clipped rather than scrollable. The header
// comment above records an earlier attempt to fix this by reordering, which moved
// the clipping instead of removing it.
//
// Trailing padding matters too: a fifth tab appears when an upload fails, and
// without it the last tab can never scroll clear of the edge.
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingLeft: 10,
    paddingRight: 18,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
  },
  count: {
    fontFamily: fonts.sansBold,
    fontSize: 11,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
})
