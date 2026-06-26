import { View, Text, StyleSheet } from 'react-native'
import { useTheme } from '../../context/ThemeContext'
import { fonts } from '../../theme/typography'
import { LibrarianRecommendationCard } from './LibrarianRecommendationCard'
import type { LibrarianResponse } from '../../lib/agents'

interface Props {
  response: LibrarianResponse
  t: (key: string) => string
  onOpen: (slug: string) => void
}

// The showcase: surfaces the librarian's REASONING as a deliberate "here's what I found and why" block, then the
// ranked, grounded recommendation cards. `reasoning` is untrusted model text — `numberOfLines`-clamped.
export function LibrarianResults({ response, t, onOpen }: Props) {
  const { colors } = useTheme()
  const { reasoning, recommendations, usedExternal } = response

  return (
    <View style={styles.container}>
      <View style={[styles.reasoning, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.reasoningLabel, { color: colors.primary, fontFamily: fonts.sansMedium }]}>
          {t('librarian.reasoningLabel')}
        </Text>
        <Text style={[styles.reasoningText, { color: colors.text, fontFamily: fonts.sans }]} numberOfLines={4}>
          {reasoning}
        </Text>
      </View>

      {usedExternal && (
        <View style={[styles.externalNote, { backgroundColor: colors.primaryLight }]}>
          <Text style={styles.externalIcon} accessibilityElementsHidden>🌐</Text>
          <Text style={[styles.externalText, { color: colors.text, fontFamily: fonts.sans }]} numberOfLines={3}>
            {t('librarian.usedExternalNote')}
          </Text>
        </View>
      )}

      {recommendations.map((rec, i) => (
        <LibrarianRecommendationCard
          key={`${rec.source}-${rec.slug ?? rec.title}-${i}`}
          index={i}
          rec={rec}
          t={t}
          onOpen={onOpen}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  reasoning: { borderRadius: 14, borderWidth: 1, padding: 14 },
  reasoningLabel: { fontSize: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  reasoningText: { fontSize: 15, lineHeight: 21 },
  externalNote: { flexDirection: 'row', gap: 8, borderRadius: 14, padding: 14, alignItems: 'flex-start' },
  externalIcon: { fontSize: 16 },
  externalText: { flex: 1, fontSize: 13, lineHeight: 19 },
})
