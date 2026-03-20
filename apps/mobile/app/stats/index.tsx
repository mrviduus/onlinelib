import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Stack, useFocusEffect } from 'expo-router'
import { readingTrackingApi } from '@textstack/shared'
import type { ReadingStatsDto, DailyStatDto, AchievementDto } from '@textstack/shared'
import { ACHIEVEMENTS, ALL_ACHIEVEMENT_CODES } from '../../src/lib/achievements'
import { useTheme } from '../../src/context/ThemeContext'
import { fonts } from '../../src/theme/typography'

export default function StatsScreen() {
  const { colors } = useTheme()
  const [stats, setStats] = useState<ReadingStatsDto | null>(null)
  const [daily, setDaily] = useState<DailyStatDto[]>([])
  const [achievements, setAchievements] = useState<AchievementDto[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const [s, d, a] = await Promise.all([
        readingTrackingApi.getStats(),
        readingTrackingApi.getDailyStats(),
        readingTrackingApi.getAchievements(),
      ])
      setStats(s)
      setDaily(d)
      setAchievements(a)
    } catch (e) {
      console.error('Stats load error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])
  useFocusEffect(useCallback(() => { if (!loading) loadData() }, [loading, loadData]))

  const onRefresh = async () => {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Reading Stats', headerShown: true }} />
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </>
    )
  }

  const unlockedSet = new Set(achievements.map(a => a.code))

  return (
    <>
      <Stack.Screen options={{ title: 'Reading Stats', headerShown: true }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Overview cards */}
        {stats && <OverviewSection stats={stats} />}

        {/* Daily goal */}
        {stats?.dailyGoal && <DailyGoalSection goal={stats.dailyGoal} />}

        {/* Heatmap */}
        <HeatmapSection daily={daily} />

        {/* Achievements */}
        <AchievementsSection unlockedSet={unlockedSet} achievements={achievements} />

        <View style={{ height: 40 }} />
      </ScrollView>
    </>
  )
}

// --- Overview ---

function OverviewSection({ stats }: { stats: ReadingStatsDto }) {
  const { colors } = useTheme()
  const totalHours = Math.floor(stats.totalSeconds / 3600)
  const totalMin = Math.round((stats.totalSeconds % 3600) / 60)

  return (
    <View style={[styles.section, { borderBottomColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.text, fontFamily: fonts.serifBold }]}>Overview</Text>
      <View style={styles.statsGrid}>
        <StatCard label="Total Time" value={totalHours > 0 ? `${totalHours}h ${totalMin}m` : `${totalMin}m`} icon="time-outline" />
        <StatCard label="Words Read" value={formatNumber(stats.totalWords)} icon="book-outline" />
        <StatCard label="Books Finished" value={String(stats.booksFinished)} icon="checkmark-done-outline" />
        <StatCard label="Current Streak" value={`${stats.currentStreak}d`} highlight={stats.currentStreak > 0} icon="flame-outline" />
        <StatCard label="Longest Streak" value={`${stats.longestStreak}d`} icon="trophy-outline" />
        <StatCard label="Avg WPM" value={String(stats.avgWordsPerMinute || 0)} icon="speedometer-outline" />
      </View>
    </View>
  )
}

function StatCard({ label, value, highlight, icon }: { label: string; value: string; highlight?: boolean; icon?: string }) {
  const { colors } = useTheme()
  return (
    <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {icon && <Ionicons name={icon as any} size={16} color={highlight ? colors.primary : colors.textSecondary} style={{ marginBottom: 4 }} />}
      <Text style={[styles.statCardValue, { color: highlight ? colors.primary : colors.text, fontFamily: fonts.serifBold }]}>{value}</Text>
      <Text style={[styles.statCardLabel, { color: colors.textSecondary, fontFamily: fonts.sans }]}>{label}</Text>
    </View>
  )
}

// --- Daily goal ---

function DailyGoalSection({ goal }: { goal: NonNullable<ReadingStatsDto['dailyGoal']> }) {
  const { colors } = useTheme()
  const pct = Math.min(100, Math.round((goal.today / goal.target) * 100))
  return (
    <View style={[styles.section, { borderBottomColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.text, fontFamily: fonts.serifBold }]}>Daily Goal</Text>
      <View style={[styles.goalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.goalRow}>
          <Text style={[styles.goalText, { color: colors.text, fontFamily: fonts.sansMedium }]}>{Math.round(goal.today)}m / {goal.target}m</Text>
          <Text style={[styles.goalPct, { color: goal.met ? colors.success : colors.primary, fontFamily: fonts.sansMedium }]}>{pct}%</Text>
        </View>
        <View style={[styles.goalTrack, { backgroundColor: colors.border }]}>
          <View style={[styles.goalFill, { width: `${pct}%`, backgroundColor: goal.met ? colors.success : colors.primary }]} />
        </View>
        {goal.met && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 8, gap: 4 }}>
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            <Text style={{ fontSize: 13, color: colors.success, fontFamily: fonts.sansMedium }}>Goal met today!</Text>
          </View>
        )}
      </View>
    </View>
  )
}

// --- Heatmap ---

function HeatmapSection({ daily }: { daily: DailyStatDto[] }) {
  const { colors } = useTheme()
  const today = new Date()
  const dayMap = new Map<string, number>()
  for (const d of daily) dayMap.set(d.date.substring(0, 10), d.totalSeconds)

  // 90 days, build grid
  const cells: { date: string; seconds: number }[] = []
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().substring(0, 10)
    cells.push({ date: key, seconds: dayMap.get(key) || 0 })
  }

  return (
    <View style={[styles.section, { borderBottomColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.text, fontFamily: fonts.serifBold }]}>Last 90 Days</Text>
      <View style={styles.heatmapGrid}>
        {cells.map(c => (
          <View
            key={c.date}
            style={[styles.heatmapCell, { backgroundColor: heatColor(c.seconds) }]}
          />
        ))}
      </View>
      <View style={styles.heatmapLegend}>
        <Text style={[styles.legendText, { color: colors.textSecondary, fontFamily: fonts.sans }]}>Less</Text>
        {[0, 300, 1200, 1800].map(s => (
          <View key={s} style={[styles.heatmapCell, styles.legendCell, { backgroundColor: heatColor(s) }]} />
        ))}
        <Text style={[styles.legendText, { color: colors.textSecondary, fontFamily: fonts.sans }]}>More</Text>
      </View>
    </View>
  )
}

function heatColor(seconds: number): string {
  if (seconds === 0) return '#F3F4F6'
  if (seconds < 600) return '#D4A574'
  if (seconds < 1800) return '#C4704B'
  return '#8B4513'
}

// --- Achievements ---

function AchievementsSection({
  unlockedSet, achievements,
}: {
  unlockedSet: Set<string>
  achievements: AchievementDto[]
}) {
  const { colors } = useTheme()
  const categories = ['milestone', 'streak', 'time', 'special']

  return (
    <View style={[styles.section, { borderBottomColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.text, fontFamily: fonts.serifBold }]}>
        Achievements ({achievements.length}/{ALL_ACHIEVEMENT_CODES.length})
      </Text>
      {categories.map(cat => {
        const codes = ALL_ACHIEVEMENT_CODES.filter(c => ACHIEVEMENTS[c].category === cat)
        return (
          <View key={cat} style={styles.achievementCategory}>
            <Text style={[styles.achievementCatTitle, { color: colors.textSecondary, fontFamily: fonts.sansMedium }]}>
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </Text>
            <View style={styles.achievementRow}>
              {codes.map(code => {
                const def = ACHIEVEMENTS[code]
                const unlocked = unlockedSet.has(code)
                return (
                  <View key={code} style={[styles.achievementItem, { backgroundColor: colors.surface, borderColor: colors.border }, !unlocked && styles.achievementLocked]}>
                    <Text style={styles.achievementEmoji}>{def.emoji}</Text>
                    <Text style={[styles.achievementName, { color: colors.text, fontFamily: fonts.sansMedium }, !unlocked && { color: colors.textSecondary }]} numberOfLines={1}>
                      {def.name}
                    </Text>
                    <Text style={[styles.achievementDesc, { color: colors.textSecondary, fontFamily: fonts.sans }]} numberOfLines={2}>
                      {def.description}
                    </Text>
                  </View>
                )
              })}
            </View>
          </View>
        )
      })}
    </View>
  )
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Sections
  section: { padding: 16, borderBottomWidth: 1 },
  sectionTitle: { fontSize: 17, marginBottom: 12 },

  // Stats grid
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCard: {
    width: '31%',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  statCardValue: { fontSize: 18 },
  statCardLabel: { fontSize: 11, marginTop: 4 },

  // Goal
  goalCard: {
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
  },
  goalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  goalText: { fontSize: 15 },
  goalPct: { fontSize: 15 },
  goalTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  goalFill: { height: '100%', borderRadius: 3 },

  // Heatmap
  heatmapGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
  },
  heatmapCell: {
    width: 14,
    height: 14,
    borderRadius: 2,
  },
  heatmapLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    justifyContent: 'flex-end',
  },
  legendCell: { width: 12, height: 12 },
  legendText: { fontSize: 10 },

  // Achievements
  achievementCategory: { marginBottom: 12 },
  achievementCatTitle: { fontSize: 13, marginBottom: 8 },
  achievementRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  achievementItem: {
    width: '47%',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
  },
  achievementLocked: { opacity: 0.4 },
  achievementEmoji: { fontSize: 22, marginBottom: 4 },
  achievementName: { fontSize: 13 },
  achievementDesc: { fontSize: 11, marginTop: 2 },
})
