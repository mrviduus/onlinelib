import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { vocabularyApi, getVocabLevel } from '@textstack/shared'
import { useAuth } from '../../src/context/AuthContext'
import { useTheme } from '../../src/context/ThemeContext'
import { useLanguage } from '../../src/context/LanguageContext'
import { fonts } from '../../src/theme/typography'
import { useQuickStats } from '../../src/hooks/useQuickStats'
import { ContinueReadingCard } from '../../src/components/ContinueReadingCard'

export default function ReadScreen() {
  const router = useRouter()
  const { colors } = useTheme()
  const { language, switchLanguage, t } = useLanguage()
  const { isAuthenticated } = useAuth()
  const quickStats = useQuickStats(isAuthenticated)

  const [refreshing, setRefreshing] = useState(false)
  const [vocabLevel, setVocabLevel] = useState(0)
  const [wordsReviewedToday, setWordsReviewedToday] = useState(0)

  const fetchVocabStats = useCallback(() => {
    if (!isAuthenticated) return
    vocabularyApi.getVocabularyStats()
      .then(stats => {
        setVocabLevel(getVocabLevel(stats.byStage.mastered).level)
        setWordsReviewedToday(stats.reviewedToday)
      })
      .catch(() => {})
  }, [isAuthenticated])

  useEffect(() => { fetchVocabStats() }, [fetchVocabStats])

  const onRefresh = () => {
    setRefreshing(true)
    fetchVocabStats()
    setTimeout(() => setRefreshing(false), 500)
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bgWarm }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>TextStack</Text>
          <TouchableOpacity
            style={[styles.langPill, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => switchLanguage(language === 'en' ? 'uk' : 'en')}
            activeOpacity={0.7}
          >
            <Ionicons name="globe-outline" size={14} color={colors.textSecondary} />
            <Text style={[styles.langPillText, { color: colors.textSecondary }]}>
              {language.toUpperCase()}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
          {t('home.hero.subtitle')}
        </Text>
      </View>

      {/* Continue Reading or Start Reading CTA */}
      {isAuthenticated ? (
        <ContinueReadingCard />
      ) : (
        <TouchableOpacity
          style={[styles.startReadingCta, { backgroundColor: colors.primary }]}
          onPress={() => router.push('/(tabs)/search')}
          activeOpacity={0.7}
        >
          <Ionicons name="book-outline" size={20} color="#fff" />
          <Text style={styles.startReadingText}>{t('bookDetail.startReading')}</Text>
          <Ionicons name="arrow-forward" size={16} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Quick Reading Stats (authenticated) */}
      {quickStats && (
        <TouchableOpacity
          style={[styles.quickStats, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => router.push('/stats/')}
          activeOpacity={0.7}
        >
          <View style={styles.quickStatItem}>
            <Ionicons name="time-outline" size={16} color={colors.primary} />
            <Text style={[styles.quickStatValue, { color: colors.text }]}>
              {Math.round(quickStats.todaySeconds / 60)}m
            </Text>
            <Text style={[styles.quickStatLabel, { color: colors.textSecondary }]}>today</Text>
          </View>
          {quickStats.currentStreak > 0 && (
            <View style={styles.quickStatItem}>
              <Ionicons name="flame-outline" size={16} color={colors.primary} />
              <Text style={[styles.quickStatValue, { color: colors.text }]}>
                {quickStats.currentStreak}d
              </Text>
              <Text style={[styles.quickStatLabel, { color: colors.textSecondary }]}>streak</Text>
            </View>
          )}
          {vocabLevel > 0 && (
            <View style={styles.quickStatItem}>
              <Ionicons name="school-outline" size={16} color={colors.primary} />
              <Text style={[styles.quickStatValue, { color: colors.text }]}>
                Lv.{vocabLevel}
              </Text>
              <Text style={[styles.quickStatLabel, { color: colors.textSecondary }]}>vocab</Text>
            </View>
          )}
          {wordsReviewedToday > 0 && (
            <View style={styles.quickStatItem}>
              <Ionicons name="checkmark-circle-outline" size={16} color={colors.primary} />
              <Text style={[styles.quickStatValue, { color: colors.text }]}>
                {wordsReviewedToday}
              </Text>
              <Text style={[styles.quickStatLabel, { color: colors.textSecondary }]}>reviewed</Text>
            </View>
          )}
          {quickStats.dailyGoalMinutes && (
            <View style={styles.quickStatItem}>
              <Ionicons name="flag-outline" size={16} color={colors.primary} />
              <Text style={[styles.quickStatValue, { color: colors.text }]}>
                {Math.round(quickStats.todaySeconds / 60)}/{quickStats.dailyGoalMinutes}m
              </Text>
              <Text style={[styles.quickStatLabel, { color: colors.textSecondary }]}>goal</Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: fonts.serif,
    fontSize: 36,
    lineHeight: 42,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
  },
  langPillText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
  },
  headerSubtitle: {
    fontFamily: fonts.serifItalic,
    fontSize: 15,
    marginTop: 4,
    textAlign: 'center',
  },

  // Quick stats
  quickStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 16,
  },
  quickStatItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  quickStatValue: { fontFamily: fonts.sansMedium, fontSize: 14 },
  quickStatLabel: { fontFamily: fonts.sans, fontSize: 12 },

  // Start reading CTA
  startReadingCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  startReadingText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: '#fff',
  },
})
