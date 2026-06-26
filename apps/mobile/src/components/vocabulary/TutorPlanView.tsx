import { View, Text, ScrollView, StyleSheet } from 'react-native'
import { useTheme } from '../../context/ThemeContext'
import { fonts } from '../../theme/typography'
import { PressableScale } from '../ui/PressableScale'
import { exerciseLabel, exerciseBadgeColor, type TutorPlanItem } from '../../lib/agents'

interface Props {
  rationale: string
  plan: TutorPlanItem[]
  readingNudge: string
  adjusted: boolean
  t: (key: string) => string
  onStart: () => void
}

// The showcase: surfaces the tutor's reasoning as a deliberate "here's your plan, and why" view — the visible
// reasoning is the point, not debug text. `rationale`/`why`/`difficulty`/`readingNudge` are untrusted LLM text, so
// every line is `numberOfLines`-clamped to bound height.
export function TutorPlanView({ rationale, plan, readingNudge, adjusted, t, onStart }: Props) {
  const { colors } = useTheme()
  const badgePalette = {
    recognition: '#3B82F6',
    recall: '#F59E0B',
    context: '#8B5CF6',
    fallback: colors.textSecondary,
  }

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Rationale */}
      <View style={[styles.rationale, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.rationaleLabel, { color: colors.primary, fontFamily: fonts.sansMedium }]}>
          {adjusted ? t('tutor.plan.adjustedLabel') : t('tutor.plan.rationaleLabel')}
        </Text>
        <Text style={[styles.rationaleText, { color: colors.text, fontFamily: fonts.sans }]} numberOfLines={4}>
          {rationale}
        </Text>
      </View>

      {/* Ordered plan */}
      {plan.map((item, i) => {
        const accent = exerciseBadgeColor(item.exerciseType, badgePalette)
        return (
          <View
            key={item.wordId}
            style={[styles.item, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <View style={[styles.index, { backgroundColor: colors.primaryLight }]}>
              <Text style={[styles.indexText, { color: colors.primary, fontFamily: fonts.sansBold }]}>{i + 1}</Text>
            </View>
            <View style={styles.itemBody}>
              <View style={styles.itemHead}>
                <Text style={[styles.itemWord, { color: colors.text, fontFamily: fonts.serifBold }]} numberOfLines={1}>
                  {item.word}
                </Text>
                <View style={[styles.badge, { backgroundColor: accent + '22', borderColor: accent }]}>
                  <Text style={[styles.badgeText, { color: accent, fontFamily: fonts.sansMedium }]}>
                    {exerciseLabel(item.exerciseType, t)}
                  </Text>
                </View>
              </View>
              {!!item.difficulty && (
                <Text
                  style={[styles.difficulty, { color: colors.textSecondary, fontFamily: fonts.sans }]}
                  numberOfLines={1}
                >
                  {item.difficulty}
                </Text>
              )}
              <Text style={[styles.why, { color: colors.textSecondary, fontFamily: fonts.sans }]} numberOfLines={3}>
                {item.why}
              </Text>
            </View>
          </View>
        )
      })}

      {/* Reading nudge — ties back to the reading thesis */}
      {!!readingNudge && (
        <View style={[styles.nudge, { backgroundColor: colors.primaryLight }]}>
          <Text style={styles.nudgeIcon} accessibilityElementsHidden>📖</Text>
          <Text style={[styles.nudgeText, { color: colors.text, fontFamily: fonts.sans }]} numberOfLines={3}>
            {readingNudge}
          </Text>
        </View>
      )}

      <PressableScale
        onPress={onStart}
        style={[styles.startBtn, { backgroundColor: colors.primary }]}
        accessibilityRole="button"
        accessibilityLabel={t('tutor.plan.start')}
      >
        <Text style={[styles.startText, { fontFamily: fonts.sansBold }]}>{t('tutor.plan.start')}</Text>
      </PressableScale>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32, gap: 10 },
  rationale: { borderRadius: 14, borderWidth: 1, padding: 14 },
  rationaleLabel: { fontSize: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  rationaleText: { fontSize: 15, lineHeight: 21 },
  item: { flexDirection: 'row', gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  index: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  indexText: { fontSize: 13 },
  itemBody: { flex: 1 },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  itemWord: { fontSize: 19, flexShrink: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1 },
  badgeText: { fontSize: 11 },
  difficulty: { fontSize: 12, marginTop: 2 },
  why: { fontSize: 13, lineHeight: 18, marginTop: 6 },
  nudge: { flexDirection: 'row', gap: 8, borderRadius: 14, padding: 14, alignItems: 'flex-start' },
  nudgeIcon: { fontSize: 16 },
  nudgeText: { flex: 1, fontSize: 14, lineHeight: 20 },
  startBtn: { marginTop: 8, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  startText: { color: '#fff', fontSize: 16 },
})
