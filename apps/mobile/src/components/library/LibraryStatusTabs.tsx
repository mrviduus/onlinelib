import { Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native'
import { useTheme } from '../../context/ThemeContext'
import { useLanguage } from '../../context/LanguageContext'
import { fonts } from '../../theme/typography'
import type { LibraryStatus } from '../../hooks/useLibraryStatus'

const TABS: LibraryStatus[] = ['all', 'reading', 'finished', 'notStarted']

interface Props {
  value: LibraryStatus
  onChange: (next: LibraryStatus) => void
  counts: Record<LibraryStatus, number>
}

/**
 * The library's filter row.
 *
 * It used to carry a count chip on every tab, and that is now gone — not
 * because the numbers were wrong (they never were; `countEntries` returns a
 * full record and is tested) but because they could not be shown. Four tabs
 * plus four chips plus the view button did not fit a phone: "Not started"
 * ended up with its label visible and its counter past the right edge, in a
 * ScrollView with the indicator hidden, so it read as a missing number rather
 * than as something to scroll to. QA filed it as "the counts don't add up".
 *
 * This is the third attempt at that row. The first reordered the tabs and moved
 * the clipping; the second tightened the metrics until the four fit ~367dp on a
 * 411dp device, which left nothing for a narrower phone or for OS font scaling.
 * Both were arithmetic against a budget that keeps changing. Tabs filter;
 * counting is not their job, and the count of what you are looking at now sits
 * above the list where it has room to be a sentence.
 */
export function LibraryStatusTabs({ value, onChange, counts }: Props) {
  const { colors } = useTheme()
  const { t } = useLanguage()
  // The failed tab still appears only when there is something in it — a filter
  // for an empty set is a dead control.
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

// Metrics are ordinary again. They were squeezed to fit counts that are no
// longer here, and a row that fits by arithmetic fits only the device the
// arithmetic was done on.
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 12,
    paddingRight: 18,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderBottomWidth: 2,
  },
})
