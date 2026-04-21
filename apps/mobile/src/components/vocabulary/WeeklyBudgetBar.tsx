import { View, Text, StyleSheet } from 'react-native'
import type { WeeklyProgressDto } from '@textstack/shared'
import { useTheme } from '../../context/ThemeContext'
import { useLanguage } from '../../context/LanguageContext'
import { fonts } from '../../theme/typography'

interface Props {
  progress: WeeklyProgressDto
}

export function WeeklyBudgetBar({ progress }: Props) {
  const { colors } = useTheme()
  const { t } = useLanguage()
  const pct = progress.budget > 0
    ? Math.min(100, Math.round((progress.used / progress.budget) * 100))
    : 0
  const reached = progress.remaining <= 0
  const fillColor = reached ? '#10B981' : colors.primary

  return (
    <View style={[styles.wrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.header}>
        <Text style={[styles.label, { color: colors.textSecondary, fontFamily: fonts.sansMedium }]}>
          {t('vocabulary.weeklyBudget.label')}
        </Text>
        <Text style={[styles.progress, { color: colors.text, fontFamily: fonts.sansMedium }]}>
          {t('vocabulary.weeklyBudget.progress')
            .replace('{used}', String(progress.used))
            .replace('{budget}', String(progress.budget))}
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.border }]}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: fillColor }]} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  label: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  progress: { fontSize: 12 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
})
