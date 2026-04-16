/**
 * Home-screen card surfacing the vocabulary review flow.
 *
 * Three states, chosen to mirror the user's actual progress loop:
 *   1. Due review queue   → primary CTA "Review N" (opens /vocabulary/review)
 *   2. Has words, 0 due   → secondary CTA "Open vocabulary" (opens /(tabs)/vocabulary)
 *   3. Empty (totalWords=0) → still rendered, for discoverability — explains
 *      that tapping a word in the reader saves it. Previously vocabulary lived
 *      only under the profile menu, so new users never found it.
 *
 * Stats refresh on mount and every time the home tab regains focus, so coming
 * back from a reader session (where a word was just saved) updates the count.
 */

import { useCallback, useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { vocabularyApi } from '@textstack/shared'
import type { VocabularyStatsDto } from '@textstack/shared'
import { useTheme } from '../../context/ThemeContext'
import { fonts } from '../../theme/typography'
import { PressableScale } from '../ui/PressableScale'

export function VocabularyReviewCard() {
  const { colors } = useTheme()
  const router = useRouter()
  const [stats, setStats] = useState<VocabularyStatsDto | null>(null)
  const [loaded, setLoaded] = useState(false)

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      ;(async () => {
        try {
          const s = await vocabularyApi.getVocabularyStats()
          if (!cancelled) setStats(s)
        } catch {
          // Unauthenticated or offline — treat as no data, still render the empty
          // state so the feature stays discoverable.
          if (!cancelled) setStats(null)
        } finally {
          if (!cancelled) setLoaded(true)
        }
      })()
      return () => {
        cancelled = true
      }
    }, []),
  )

  if (!loaded) return null

  const totalWords = stats?.totalWords ?? 0
  const dueNow = stats?.dueNow ?? 0
  const mastered = stats?.byStage?.mastered ?? 0

  let headline: string
  let subline: string
  let ctaLabel: string
  let ctaAction: () => void
  let iconName: keyof typeof Ionicons.glyphMap

  if (totalWords === 0) {
    headline = 'Start your vocabulary'
    subline = 'Tap a word while reading to save it and begin practicing.'
    ctaLabel = 'Learn more'
    iconName = 'school-outline'
    ctaAction = () => router.push('/(tabs)/vocabulary' as never)
  } else if (dueNow > 0) {
    headline = `${dueNow} word${dueNow === 1 ? '' : 's'} ready to review`
    subline = `${totalWords} saved · ${mastered} mastered`
    ctaLabel = 'Review'
    iconName = 'flash'
    ctaAction = () => router.push('/vocabulary/review?reviewMode=blitz' as never)
  } else {
    headline = `${totalWords} word${totalWords === 1 ? '' : 's'} saved`
    subline = mastered > 0 ? `${mastered} mastered — keep it up.` : 'Nothing due. Check back later.'
    ctaLabel = 'Open'
    iconName = 'school'
    ctaAction = () => router.push('/(tabs)/vocabulary' as never)
  }

  const isActionable = dueNow > 0

  return (
    <PressableScale
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: isActionable ? colors.primary : colors.border,
        },
      ]}
      onPress={ctaAction}
    >
      <View
        style={[
          styles.iconBubble,
          { backgroundColor: isActionable ? colors.primary : colors.primaryLight },
        ]}
      >
        <Ionicons
          name={iconName}
          size={20}
          color={isActionable ? '#fff' : colors.primary}
        />
      </View>
      <View style={styles.info}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Vocabulary</Text>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
          {headline}
        </Text>
        <Text
          style={[styles.subline, { color: colors.textSecondary }]}
          numberOfLines={1}
        >
          {subline}
        </Text>
      </View>
      <View
        style={[
          styles.ctaPill,
          {
            backgroundColor: isActionable ? colors.primary : 'transparent',
            borderColor: isActionable ? colors.primary : colors.border,
          },
        ]}
      >
        <Text
          style={[
            styles.ctaLabel,
            { color: isActionable ? '#fff' : colors.text },
          ]}
        >
          {ctaLabel}
        </Text>
      </View>
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    lineHeight: 20,
  },
  subline: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  ctaPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  ctaLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
  },
})
