import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, TextInput as TextInputNative,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Stack, useFocusEffect } from 'expo-router'
import { readingTrackingApi } from '@textstack/shared'
import type { ReadingStatsDto, DailyStatDto, AchievementDto, GoalDto } from '@textstack/shared'
import type { BookStatsResponse } from '@textstack/shared'
import { ACHIEVEMENTS, ALL_ACHIEVEMENT_CODES } from '../../src/lib/achievements'
import { useTheme } from '../../src/context/ThemeContext'
import { fonts } from '../../src/theme/typography'
import { SkeletonLoader } from '../../src/components/ui/SkeletonLoader'

type StatsTab = 'overview' | 'books' | 'time' | 'achievements'

export default function StatsScreen() {
  const { colors } = useTheme()
  const [tab, setTab] = useState<StatsTab>('overview')
  const [stats, setStats] = useState<ReadingStatsDto | null>(null)
  const [daily, setDaily] = useState<DailyStatDto[]>([])
  const [achievements, setAchievements] = useState<AchievementDto[]>([])
  const [goals, setGoals] = useState<GoalDto[]>([])
  const [bookStats, setBookStats] = useState<BookStatsResponse | null>(null)
  const [year, setYear] = useState<number | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const [s, d, a, g, bs] = await Promise.all([
        readingTrackingApi.getStats(),
        readingTrackingApi.getDailyStats(),
        readingTrackingApi.getAchievements(),
        readingTrackingApi.getGoals().catch(() => [] as GoalDto[]),
        readingTrackingApi.getBookStats(year).catch(() => null as BookStatsResponse | null),
      ])
      setStats(s)
      setDaily(d)
      setAchievements(a)
      setGoals(g)
      setBookStats(bs)
    } catch (e) {
      console.error('Stats load error:', e)
    } finally {
      setLoading(false)
    }
  }, [year])

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
        <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
          {/* Overview skeleton */}
          <View style={[styles.section, { borderBottomColor: colors.border }]}>
            <SkeletonLoader width={100} height={18} style={{ marginBottom: 12 }} />
            <View style={styles.statsGrid}>
              {Array.from({ length: 6 }).map((_, i) => (
                <View key={i} style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <SkeletonLoader width={16} height={16} borderRadius={8} style={{ marginBottom: 4 }} />
                  <SkeletonLoader width={40} height={18} style={{ marginBottom: 4 }} />
                  <SkeletonLoader width={50} height={11} />
                </View>
              ))}
            </View>
          </View>
          {/* Heatmap skeleton */}
          <View style={[styles.section, { borderBottomColor: colors.border }]}>
            <SkeletonLoader width={100} height={18} style={{ marginBottom: 12 }} />
            <SkeletonLoader height={80} borderRadius={6} />
          </View>
          {/* Achievements skeleton */}
          <View style={[styles.section, { borderBottomColor: colors.border }]}>
            <SkeletonLoader width={140} height={18} style={{ marginBottom: 12 }} />
            <View style={styles.achievementRow}>
              {Array.from({ length: 4 }).map((_, i) => (
                <View key={i} style={[styles.achievementItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <SkeletonLoader width={22} height={22} borderRadius={4} style={{ marginBottom: 4 }} />
                  <SkeletonLoader width="70%" height={13} style={{ marginBottom: 4 }} />
                  <SkeletonLoader width="90%" height={11} />
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </>
    )
  }

  const unlockedSet = new Set(achievements.map(a => a.code))
  const isEmpty = stats && stats.totalSeconds === 0 && daily.length === 0

  if (isEmpty) {
    return (
      <>
        <Stack.Screen options={{ title: 'Reading Stats', headerShown: true }} />
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <Ionicons name="bar-chart-outline" size={48} color={colors.textSecondary} style={{ marginBottom: 12 }} />
          <Text style={{ fontSize: 16, color: colors.text, fontFamily: fonts.sansMedium, textAlign: 'center' }}>
            No reading stats yet
          </Text>
          <Text style={{ fontSize: 13, color: colors.textSecondary, fontFamily: fonts.sans, textAlign: 'center', marginTop: 4 }}>
            Start reading a book to track your progress
          </Text>
        </View>
      </>
    )
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Reading Stats', headerShown: true }} />
      <View style={{ backgroundColor: colors.background, flex: 1 }}>
        {/* Tabs */}
        <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
          {([['overview', 'Overview'], ['books', 'Books'], ['time', 'Time'], ['achievements', 'Achievements']] as const).map(([key, label]) => (
            <TouchableOpacity
              key={key}
              style={[styles.tabItem, tab === key && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
              onPress={() => setTab(key)}
            >
              <Text style={[styles.tabLabel, { color: tab === key ? colors.primary : colors.textSecondary }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Year filter for books/time tabs */}
        {(tab === 'books' || tab === 'time') && bookStats?.availableYears && bookStats.availableYears.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.yearRow}>
            <TouchableOpacity
              onPress={() => setYear(undefined)}
              style={[styles.yearChip, { backgroundColor: !year ? colors.primary : colors.surface, borderColor: !year ? colors.primary : colors.border }]}
            >
              <Text style={[styles.yearChipText, { color: !year ? '#fff' : colors.textSecondary }]}>All Time</Text>
            </TouchableOpacity>
            {bookStats.availableYears.map(y => (
              <TouchableOpacity
                key={y}
                onPress={() => setYear(year === y ? undefined : y)}
                style={[styles.yearChip, { backgroundColor: year === y ? colors.primary : colors.surface, borderColor: year === y ? colors.primary : colors.border }]}
              >
                <Text style={[styles.yearChipText, { color: year === y ? '#fff' : colors.textSecondary }]}>{y}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <ScrollView
          style={{ flex: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {tab === 'overview' && (
            <>
              {stats && <TodaySummary stats={stats} daily={daily} />}
              {stats && <OverviewSection stats={stats} />}
              {stats?.dailyGoal && <DailyGoalSection goal={stats.dailyGoal} />}
              <GoalsSection goals={goals} onUpdate={loadData} />
              <WeeklyChartSection daily={daily} />
              <HeatmapSection daily={daily} />
            </>
          )}

          {tab === 'books' && <BooksTabSection bookStats={bookStats} />}

          {tab === 'time' && <TimeTabSection bookStats={bookStats} stats={stats} />}

          {tab === 'achievements' && <AchievementsSection unlockedSet={unlockedSet} achievements={achievements} />}

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </>
  )
}

// --- Today Summary ---

function TodaySummary({ stats, daily }: { stats: ReadingStatsDto; daily: DailyStatDto[] }) {
  const { colors } = useTheme()
  const todayKey = new Date().toISOString().split('T')[0]
  const todayData = daily.find(d => d.date.substring(0, 10) === todayKey)
  const todaySec = stats.todaySeconds || 0
  const todayWords = todayData?.totalWords || 0
  const h = Math.floor(todaySec / 3600)
  const m = Math.round((todaySec % 3600) / 60)
  const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`

  return (
    <View style={[styles.section, { borderBottomColor: colors.border }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontFamily: fonts.sansMedium, fontSize: 14, color: colors.textSecondary }}>Today</Text>
        <Text style={{ fontFamily: fonts.sansMedium, fontSize: 14, color: colors.text }}>
          {timeStr}
          {todayWords > 0 && ` · ${formatNumber(todayWords)} words`}
          {stats.dailyGoal && ` · ${Math.round((stats.dailyGoal.today / Math.max(stats.dailyGoal.target, 1)) * 100)}%`}
        </Text>
      </View>
      {(stats.currentStreak || 0) > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
          <Ionicons name="flame-outline" size={14} color={colors.primary} />
          <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: colors.primary }}>{stats.currentStreak} day streak</Text>
        </View>
      )}
    </View>
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

// --- Weekly Chart ---

function WeeklyChartSection({ daily }: { daily: DailyStatDto[] }) {
  const { colors } = useTheme()
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const dayMap = new Map<string, number>()
  for (const d of daily) dayMap.set(d.date.substring(0, 10), d.totalSeconds)

  const bars: { label: string; seconds: number }[] = []
  const today = new Date()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().substring(0, 10)
    bars.push({ label: days[d.getDay()], seconds: dayMap.get(key) || 0 })
  }

  const maxSeconds = Math.max(...bars.map(b => b.seconds), 1)
  const chartHeight = 100

  return (
    <View style={[styles.section, { borderBottomColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.text, fontFamily: fonts.serifBold }]}>This Week</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: chartHeight, paddingHorizontal: 4 }}>
        {bars.map((b, i) => {
          const pct = b.seconds / maxSeconds
          const barH = Math.max(pct * (chartHeight - 20), b.seconds > 0 ? 4 : 0)
          const mins = Math.round(b.seconds / 60)
          return (
            <View key={i} style={{ alignItems: 'center', flex: 1 }}>
              {mins > 0 && (
                <Text style={{ fontFamily: fonts.sans, fontSize: 9, color: colors.textSecondary, marginBottom: 2 }}>
                  {mins}m
                </Text>
              )}
              <View style={{ width: '60%', height: barH, backgroundColor: colors.primary, borderRadius: 3 }} />
              <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: colors.textSecondary, marginTop: 4 }}>
                {b.label}
              </Text>
            </View>
          )
        })}
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
                const unlockedAt = achievements.find(a => a.code === code)?.unlockedAt
                return (
                  <View key={code} style={[styles.achievementItem, { backgroundColor: colors.surface, borderColor: colors.border }, !unlocked && styles.achievementLocked]}>
                    <Text style={styles.achievementEmoji}>{def.emoji}</Text>
                    <Text style={[styles.achievementName, { color: colors.text, fontFamily: fonts.sansMedium }, !unlocked && { color: colors.textSecondary }]} numberOfLines={1}>
                      {def.name}
                    </Text>
                    <Text style={[styles.achievementDesc, { color: colors.textSecondary, fontFamily: fonts.sans }]} numberOfLines={2}>
                      {def.description}
                    </Text>
                    {unlocked && unlockedAt && (
                      <Text style={{ fontSize: 10, color: colors.textSecondary, fontFamily: fonts.sans, marginTop: 4 }}>
                        {new Date(unlockedAt).toLocaleDateString()}
                      </Text>
                    )}
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

// --- Goals ---

function GoalsSection({ goals, onUpdate }: { goals: GoalDto[]; onUpdate: () => void }) {
  const { colors } = useTheme()
  const [showForm, setShowForm] = useState(false)
  const [goalType, setGoalType] = useState<'daily_minutes' | 'books_per_year'>('daily_minutes')
  const [target, setTarget] = useState('')
  const [streakMin, setStreakMin] = useState('')
  const [saving, setSaving] = useState(false)

  const handleCreate = async () => {
    const val = parseInt(target)
    if (!val || val <= 0) return
    setSaving(true)
    const smm = parseInt(streakMin)
    try {
      await readingTrackingApi.createGoal({ type: goalType, target: val, streakMinMinutes: smm > 0 ? smm : undefined })
      setShowForm(false)
      setTarget('')
      setStreakMin('')
      onUpdate()
    } catch {}
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    try {
      await readingTrackingApi.deleteGoal(id)
      onUpdate()
    } catch {}
  }

  return (
    <View style={[styles.section, { borderBottomColor: colors.border }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text style={[styles.sectionTitle, { color: colors.text, fontFamily: fonts.serifBold, marginBottom: 0 }]}>Goals</Text>
        {!showForm && (
          <TouchableOpacity onPress={() => setShowForm(true)}>
            <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>

      {goals.map(g => (
        <View key={g.id} style={[styles.goalCard, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 8 }]}>
          <View style={styles.goalRow}>
            <Text style={[styles.goalText, { color: colors.text, fontFamily: fonts.sansMedium }]}>
              {g.goalType === 'daily_minutes' ? `${g.targetValue} min/day` : `${g.targetValue} books/year`}
            </Text>
            <TouchableOpacity onPress={() => handleDelete(g.id)}>
              <Ionicons name="trash-outline" size={18} color={colors.error} />
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {goals.length === 0 && !showForm && (
        <Text style={{ fontSize: 13, color: colors.textSecondary, fontFamily: fonts.sans }}>
          No goals set. Tap + to create one.
        </Text>
      )}

      {showForm && (
        <View style={[styles.goalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
            {(['daily_minutes', 'books_per_year'] as const).map(t => (
              <TouchableOpacity
                key={t}
                onPress={() => setGoalType(t)}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: goalType === t ? colors.primaryLight : 'transparent' }}
              >
                <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: goalType === t ? colors.primary : colors.textSecondary }}>
                  {t === 'daily_minutes' ? 'Daily Minutes' : 'Books/Year'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <View style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text style={{ position: 'absolute', right: 12, top: 10, fontSize: 12, color: colors.textSecondary, fontFamily: fonts.sans }}>
                {goalType === 'daily_minutes' ? 'min' : 'books'}
              </Text>
              <View style={{ flexDirection: 'row' }}>
                <TextInputNative
                  style={{ flex: 1, fontFamily: fonts.sans, fontSize: 14, color: colors.text }}
                  value={target}
                  onChangeText={setTarget}
                  keyboardType="numeric"
                  placeholder={goalType === 'daily_minutes' ? '30' : '12'}
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
            </View>
            <TouchableOpacity
              onPress={handleCreate}
              disabled={saving}
              style={{ backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 }}
            >
              <Text style={{ color: '#fff', fontFamily: fonts.sansMedium, fontSize: 14 }}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowForm(false)}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          {goalType === 'daily_minutes' && (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.textSecondary }}>Streak threshold:</Text>
              <View style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, maxWidth: 100 }}>
                <TextInputNative
                  style={{ fontFamily: fonts.sans, fontSize: 14, color: colors.text }}
                  value={streakMin}
                  onChangeText={setStreakMin}
                  keyboardType="numeric"
                  placeholder="5"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
              <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.textSecondary }}>min</Text>
            </View>
          )}
        </View>
      )}
    </View>
  )
}

// --- Books Tab ---

function BooksTabSection({ bookStats }: { bookStats: BookStatsResponse | null }) {
  const { colors } = useTheme()
  if (!bookStats) return <Text style={{ padding: 16, color: colors.textSecondary, fontFamily: fonts.sans }}>No book stats yet</Text>

  return (
    <View style={{ padding: 16 }}>
      {/* Summary */}
      <View style={styles.statsGrid}>
        <StatCard label="Books Finished" value={String(bookStats.booksFinished)} icon="checkmark-done-outline" />
        <StatCard label="Total Pages" value={formatNumber(bookStats.totalPages)} icon="document-text-outline" />
        <StatCard label="Avg Days/Book" value={String(bookStats.avgDaysToFinish)} icon="calendar-outline" />
      </View>

      {/* Genre breakdown */}
      {bookStats.genreStats.length > 0 && (
        <View style={{ marginTop: 20 }}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontFamily: fonts.serifBold }]}>By Genre</Text>
          {bookStats.genreStats.map(g => (
            <BarRow key={g.slug} label={g.name} value={g.count} max={bookStats.genreStats[0].count} />
          ))}
        </View>
      )}

      {/* Author breakdown */}
      {bookStats.authorStats.length > 0 && (
        <View style={{ marginTop: 20 }}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontFamily: fonts.serifBold }]}>By Author</Text>
          {bookStats.authorStats.map(a => (
            <BarRow key={a.slug} label={a.name} value={a.count} max={bookStats.authorStats[0].count} />
          ))}
        </View>
      )}

      {/* Language breakdown */}
      {bookStats.languageStats.length > 0 && (
        <View style={{ marginTop: 20 }}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontFamily: fonts.serifBold }]}>By Language</Text>
          {bookStats.languageStats.map(l => (
            <BarRow key={l.language} label={l.language.toUpperCase()} value={l.count} max={bookStats.languageStats[0].count} />
          ))}
        </View>
      )}

      {/* Books over time */}
      {bookStats.booksOverTime.length > 0 && (
        <View style={{ marginTop: 20 }}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontFamily: fonts.serifBold }]}>Books Over Time</Text>
          {bookStats.booksOverTime.map(b => (
            <BarRow key={b.period} label={b.period} value={b.books} suffix={`(${formatNumber(b.pages)} pg)`} max={Math.max(...bookStats.booksOverTime.map(x => x.books))} />
          ))}
        </View>
      )}

      {/* Book length distribution */}
      {bookStats.bookLengthDistribution.length > 0 && (
        <View style={{ marginTop: 20 }}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontFamily: fonts.serifBold }]}>Book Length</Text>
          {bookStats.bookLengthDistribution.map(b => (
            <BarRow key={b.bucket} label={b.bucket} value={b.count} max={Math.max(...bookStats.bookLengthDistribution.map(x => x.count))} />
          ))}
        </View>
      )}

      {/* Rating distribution */}
      {bookStats.avgRating != null && (
        <View style={{ marginTop: 20 }}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontFamily: fonts.serifBold }]}>Ratings</Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.textSecondary, marginBottom: 8 }}>
            Average: {bookStats.avgRating.toFixed(1)} / 5
          </Text>
          {bookStats.ratingDistribution.sort((a, b) => b.rating - a.rating).map(r => (
            <BarRow key={r.rating} label={`${'★'.repeat(r.rating)}`} value={r.count} max={Math.max(...bookStats.ratingDistribution.map(x => x.count))} />
          ))}
        </View>
      )}
    </View>
  )
}

// --- Time Tab ---

function TimeTabSection({ bookStats, stats }: { bookStats: BookStatsResponse | null; stats: ReadingStatsDto | null }) {
  const { colors } = useTheme()

  const totalH = stats ? Math.floor(stats.totalSeconds / 3600) : 0
  const totalM = stats ? Math.round((stats.totalSeconds % 3600) / 60) : 0
  const weekH = stats ? Math.floor((stats.weekSeconds || 0) / 3600) : 0
  const weekM = stats ? Math.round(((stats.weekSeconds || 0) % 3600) / 60) : 0
  const monthH = stats ? Math.floor((stats.monthSeconds || 0) / 3600) : 0
  const monthM = stats ? Math.round(((stats.monthSeconds || 0) % 3600) / 60) : 0

  return (
    <View style={{ padding: 16 }}>
      {/* Time summary */}
      <View style={styles.statsGrid}>
        <StatCard label="Total Time" value={totalH > 0 ? `${totalH}h ${totalM}m` : `${totalM}m`} icon="time-outline" />
        <StatCard label="This Week" value={weekH > 0 ? `${weekH}h ${weekM}m` : `${weekM}m`} icon="calendar-outline" />
        <StatCard label="This Month" value={monthH > 0 ? `${monthH}h ${monthM}m` : `${monthM}m`} icon="today-outline" />
      </View>

      {/* Pace distribution */}
      {bookStats && bookStats.paceStats.length > 0 && (
        <View style={{ marginTop: 20 }}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontFamily: fonts.serifBold }]}>Reading Pace</Text>
          {bookStats.paceStats.map(p => (
            <BarRow key={p.pace} label={p.pace} value={p.count} max={Math.max(...bookStats.paceStats.map(x => x.count))} />
          ))}
        </View>
      )}

      {/* Mood stats */}
      {bookStats && bookStats.moodStats.length > 0 && (
        <View style={{ marginTop: 20 }}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontFamily: fonts.serifBold }]}>Reading Moods</Text>
          {bookStats.moodStats.map(m => (
            <BarRow key={m.name} label={`${m.emoji || ''} ${m.name}`} value={m.count} max={bookStats.moodStats[0].count} />
          ))}
        </View>
      )}

      {/* Reading time by genre */}
      {bookStats && bookStats.readingTimeByGenre.length > 0 && (
        <View style={{ marginTop: 20 }}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontFamily: fonts.serifBold }]}>Time by Genre</Text>
          {bookStats.readingTimeByGenre.map(g => (
            <BarRow key={g.slug} label={g.name} value={Math.round(g.seconds / 60)} suffix="min" max={Math.round(bookStats.readingTimeByGenre[0].seconds / 60)} />
          ))}
        </View>
      )}

      {/* Reading time by author */}
      {bookStats && bookStats.readingTimeByAuthor.length > 0 && (
        <View style={{ marginTop: 20 }}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontFamily: fonts.serifBold }]}>Time by Author</Text>
          {bookStats.readingTimeByAuthor.map(a => (
            <BarRow key={a.slug} label={a.name} value={Math.round(a.seconds / 60)} suffix="min" max={Math.round(bookStats.readingTimeByAuthor[0].seconds / 60)} />
          ))}
        </View>
      )}
    </View>
  )
}

// --- Bar Row (reusable chart row) ---

function BarRow({ label, value, max, suffix }: { label: string; value: number; max: number; suffix?: string }) {
  const { colors } = useTheme()
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <View style={{ marginBottom: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
        <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.text, flex: 1 }} numberOfLines={1}>{label}</Text>
        <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: colors.primary }}>{value}{suffix ? ` ${suffix}` : ''}</Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' }}>
        <View style={{ height: '100%', width: `${pct}%`, backgroundColor: colors.primary, borderRadius: 3 }} />
      </View>
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

  // Tabs
  tabRow: { flexDirection: 'row', borderBottomWidth: 1 },
  tabItem: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabLabel: { fontFamily: fonts.sansMedium, fontSize: 13 },

  // Year filter
  yearRow: { paddingHorizontal: 16, paddingVertical: 8, gap: 6 },
  yearChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  yearChipText: { fontFamily: fonts.sansMedium, fontSize: 12 },

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
