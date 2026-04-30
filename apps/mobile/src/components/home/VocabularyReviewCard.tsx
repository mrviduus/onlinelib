/**
 * Home-screen card surfacing the vocabulary review flow.
 *
 * Three content states, chosen to mirror the user's actual progress loop:
 *   1. Due review queue   → primary CTA "Review N" (opens /vocabulary/review)
 *   2. Has words, 0 due   → secondary CTA "Open" (opens /(tabs)/vocabulary)
 *   3. Empty (totalWords=0) → still rendered, for discoverability — explains
 *      that tapping a word in the reader saves it. Previously vocabulary lived
 *      only under the profile menu, so new users never found it.
 *
 * Load strategy:
 *   - On focus, read last-known stats from AsyncStorage synchronously-ish so we
 *     can render immediately (no layout shift) even on cold start.
 *   - In parallel, hit the server; on success, swap in fresh stats and persist.
 *   - If the server call fails (offline, 401), we keep showing the cached
 *     value. Without the cache, a user with 500 saved words would see
 *     "Start your vocabulary" when offline — actively misleading.
 *
 * Subline priority: streak > mastered count > nothing-due text. Streak is
 * the strongest habit driver; surface it first when available.
 *
 * All user-facing copy goes through the shared i18n `t()` — hardcoded strings
 * would break UK users the moment they switched language.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { vocabularyApi } from '@textstack/shared'
import type { VocabularyStatsDto } from '@textstack/shared'
import { useTheme } from '../../context/ThemeContext'
import { useLanguage } from '../../context/LanguageContext'
import { fonts } from '../../theme/typography'
import { PressableScale } from '../ui/PressableScale'
import { SkeletonLoader } from '../ui/SkeletonLoader'
import { getVocabStatsCache, saveVocabStatsCache } from '../../lib/vocabStatsCache'
import { vocabReminder } from '../../lib/vocabReminder'

type IconName = keyof typeof Ionicons.glyphMap

/** Minimal dot-notation template replace. */
function interpolate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    vars[k] == null ? `{${k}}` : String(vars[k]),
  )
}

export function VocabularyReviewCard() {
  const { colors } = useTheme()
  const { t } = useLanguage()
  const router = useRouter()
  const [stats, setStats] = useState<VocabularyStatsDto | null>(null)
  const [initialLoaded, setInitialLoaded] = useState(false)
  // Prevents a race where a slow network response overwrites a fresh focus
  // refetch. Bumped on every focus.
  const fetchTokenRef = useRef(0)

  // Seed from cache on first mount so we can render immediately without flicker.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const cached = await getVocabStatsCache()
      if (cancelled) return
      if (cached) setStats(cached.stats)
      setInitialLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Refetch on every focus — covers "user saved a word in the reader, came
  // back to home". Cached state is shown during the refetch.
  useFocusEffect(
    useCallback(() => {
      const token = ++fetchTokenRef.current
      ;(async () => {
        try {
          const fresh = await vocabularyApi.getVocabularyStats()
          if (fetchTokenRef.current !== token) return
          setStats(fresh)
          void saveVocabStatsCache(fresh)
        } catch {
          // Offline / 401 — keep stale cached value. Only fall through to
          // the empty state if we genuinely have no cache on cold start.
        }
      })()
    }, []),
  )

  // Keep the scheduled daily reminder's copy in sync with the current language.
  // Users who toggled the reminder in English and then switched to UK would
  // otherwise get an English notification; rescheduling on focus fixes this
  // without forcing them to re-open settings.
  useEffect(() => {
    if (!initialLoaded) return
    let cancelled = false
    ;(async () => {
      const s = await vocabReminder.getSettings()
      if (cancelled || !s.enabled) return
      await vocabReminder.schedule({
        hour: s.hour,
        minute: s.minute,
        title: t('profile.vocabReminder.notificationTitle'),
        body: t('profile.vocabReminder.notificationBody'),
      })
    })()
    return () => {
      cancelled = true
    }
    // t is the curried translator — its identity changes when language
    // changes, which is exactly when we want to reschedule.
  }, [initialLoaded, t])

  // Skeleton while we wait for the cache read (typically <10ms on warm cache,
  // but can be longer on cold start). Reserves exact card height so the home
  // scroll doesn't jump when the real card swaps in.
  if (!initialLoaded) {
    return (
      <View
        style={[
          styles.card,
          styles.skeletonCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <SkeletonLoader width={44} height={44} borderRadius={12} />
        <View style={styles.info}>
          <SkeletonLoader width={70} height={10} />
          <SkeletonLoader width={180} height={15} style={{ marginTop: 6 }} />
          <SkeletonLoader width={140} height={12} style={{ marginTop: 4 }} />
        </View>
        <SkeletonLoader width={64} height={28} borderRadius={14} />
      </View>
    )
  }

  const totalWords = stats?.totalWords ?? 0
  const dueNowRaw = stats?.dueNow ?? 0
  const weeklyRemaining = stats?.weeklyProgress?.remaining
  // Effective due clamps the server's raw due count by the remaining weekly
  // review budget. When budget is exhausted we show the "goal reached" state
  // instead of surfacing reviews the backend will refuse to serve.
  const dueNow = weeklyRemaining != null ? Math.min(dueNowRaw, weeklyRemaining) : dueNowRaw
  // Show the goal-reached state whenever the budget is exhausted, regardless
  // of dueNow. The web parity is the same: WeeklyBudgetBar always wins over
  // "nothing due" copy when a user has actively spent the week's reviews.
  const budgetReached = weeklyRemaining != null && weeklyRemaining <= 0
  const mastered = stats?.byStage?.mastered ?? 0
  const streak = stats?.streak ?? 0

  // Pluralization helper — count-aware title key.
  const savedTitle = () => {
    const key = totalWords === 1 ? 'home.vocabCard.savedTitleOne' : 'home.vocabCard.savedTitleMany'
    return interpolate(t(key), { count: totalWords })
  }

  // Four mutually-exclusive UI states; resolving them inside one function lets
  // each branch return a coherent record instead of mutating five `let`s.
  const resolveState = (): {
    headline: string
    subline: string
    ctaLabel: string
    iconName: IconName
    ctaAction: () => void
  } => {
    const openVocab = () => router.push('/(tabs)/vocabulary' as never)

    if (totalWords === 0) {
      return {
        headline: t('home.vocabCard.emptyTitle'),
        subline: t('home.vocabCard.emptySubline'),
        ctaLabel: t('home.vocabCard.learnMoreCta'),
        iconName: 'school-outline',
        ctaAction: openVocab,
      }
    }
    if (budgetReached) {
      return {
        headline: savedTitle(),
        subline: t('vocabulary.banner.budgetReached'),
        ctaLabel: t('vocabulary.practice.cta'),
        iconName: 'infinite',
        ctaAction: () => router.push('/vocabulary/review?practice=1' as never),
      }
    }
    if (dueNow > 0) {
      const dueKey = dueNow === 1 ? 'home.vocabCard.dueTitleOne' : 'home.vocabCard.dueTitleMany'
      // Streak is the strongest retention signal; fall back to mastered count.
      const subline = streak > 0
        ? interpolate(t('home.vocabCard.sublineStreak'), { saved: totalWords, streak })
        : interpolate(t('home.vocabCard.sublineMastered'), { saved: totalWords, mastered })
      return {
        headline: interpolate(t(dueKey), { count: dueNow }),
        subline,
        ctaLabel: t('home.vocabCard.reviewCta'),
        iconName: 'flash',
        ctaAction: () => router.push('/vocabulary/review' as never),
      }
    }
    // Has words, 0 due, budget not exhausted.
    const subline = mastered > 0
      ? interpolate(t('home.vocabCard.sublineMasteredKeepUp'), { mastered })
      : t('home.vocabCard.sublineNothingDue')
    return {
      headline: savedTitle(),
      subline,
      ctaLabel: t('home.vocabCard.openCta'),
      iconName: 'school',
      ctaAction: openVocab,
    }
  }

  const { headline, subline, ctaLabel, iconName, ctaAction } = resolveState()
  const isActionable = dueNow > 0 || budgetReached

  // Stitch together a single accessibility label so VoiceOver reads the card
  // as one coherent announcement instead of three separate children.
  const a11yLabel = `${t('home.vocabCard.label')}. ${headline}. ${subline}`

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
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint={ctaLabel}
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
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          {t('home.vocabCard.label')}
        </Text>
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
  // Reserves the same footprint as the real card while the initial cache read
  // resolves. Keep styles identical to `.card` so swap-in is invisible.
  skeletonCard: {
    minHeight: 68,
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
