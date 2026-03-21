import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  RefreshControl,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter, Stack, useFocusEffect } from 'expo-router'
import { vocabularyApi } from '@textstack/shared'
import type { VocabularyWordDto, VocabularyStatsDto } from '@textstack/shared'
import { useTheme } from '../../src/context/ThemeContext'
import { fonts } from '../../src/theme/typography'
import { SkeletonLoader } from '../../src/components/ui/SkeletonLoader'

const STAGE_LABELS = ['New', 'Recognition', 'Recall', 'Context', 'Mastered']
const STAGE_COLORS = ['#9CA3AF', '#3B82F6', '#F59E0B', '#8B5CF6', '#10B981']

const TABS = [
  { key: 'all', label: 'All', filter: undefined },
  { key: 'new', label: 'New', filter: '0' },
  { key: 'learning', label: 'Learning', filter: '1,2,3' },
  { key: 'mastered', label: 'Mastered', filter: '4' },
] as const

type TabKey = typeof TABS[number]['key']

export default function VocabularyScreen() {
  const { colors } = useTheme()
  const router = useRouter()
  const [words, setWords] = useState<VocabularyWordDto[]>([])
  const [stats, setStats] = useState<VocabularyStatsDto | null>(null)
  const [tab, setTab] = useState<TabKey>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const activeFilter = TABS.find(t => t.key === tab)?.filter

  const loadData = useCallback(async () => {
    try {
      const [res, st] = await Promise.all([
        vocabularyApi.getWords({ filter: activeFilter, search: search || undefined, limit: 200 }),
        vocabularyApi.getVocabularyStats(),
      ])
      setWords(res.items)
      setStats(st)
    } catch (e) {
      console.error('Vocab load error:', e)
    } finally {
      setLoading(false)
    }
  }, [activeFilter, search])

  useEffect(() => { setLoading(true); loadData() }, [loadData])

  useFocusEffect(useCallback(() => {
    if (!loading) loadData()
  }, [loading, loadData]))

  const onRefresh = async () => {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }

  const handleDelete = async (id: string) => {
    try {
      await vocabularyApi.deleteWord(id)
      setWords(prev => prev.filter(w => w.id !== id))
      setExpandedId(null)
    } catch {}
  }

  const dueCount = stats ? (stats.byStage[0] || 0) + (stats.byStage[1] || 0) + (stats.byStage[2] || 0) + (stats.byStage[3] || 0) : 0

  return (
    <>
      <Stack.Screen options={{ title: 'Vocabulary', headerShown: true }} />
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Stats bar */}
        {stats && (
          <View style={[styles.statsBar, { borderBottomColor: colors.border }]}>
            <StatBox label="Total" value={stats.total} />
            <StatBox label="Due" value={dueCount} color={dueCount > 0 ? colors.primary : undefined} />
            <StatBox label="Mastered" value={stats.byStage[4] || 0} color="#10B981" />
          </View>
        )}

        {/* Review button */}
        {dueCount > 0 && (
          <TouchableOpacity
            style={[styles.reviewBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push('/vocabulary/review')}
          >
            <Ionicons name="school-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
            <Text style={[styles.reviewBtnText, { fontFamily: fonts.sansMedium }]}>Start Review ({dueCount})</Text>
          </TouchableOpacity>
        )}

        {/* Filter tabs */}
        <View style={styles.tabs}>
          {TABS.map(t => (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, { backgroundColor: colors.surface, borderColor: colors.border }, tab === t.key && { backgroundColor: colors.primary, borderColor: colors.primary }]}
              onPress={() => setTab(t.key)}
            >
              <Text style={[styles.tabText, { color: colors.textSecondary, fontFamily: fonts.sansMedium }, tab === t.key && { color: '#fff' }]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Search */}
        <TextInput
          style={[styles.searchInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text, fontFamily: fonts.sans }]}
          placeholder="Search words..."
          placeholderTextColor={colors.textSecondary}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />

        {loading ? (
          <View style={styles.listContent}>
            {Array.from({ length: 6 }).map((_, i) => (
              <View key={i} style={[styles.wordRow, { borderBottomColor: colors.border }]}>
                <View style={styles.wordHeader}>
                  <View style={{ flex: 1 }}>
                    <SkeletonLoader width={100} height={16} />
                    <SkeletonLoader width={140} height={13} style={{ marginTop: 4 }} />
                  </View>
                  <SkeletonLoader width={60} height={20} borderRadius={4} />
                </View>
              </View>
            ))}
          </View>
        ) : words.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="book-outline" size={48} color={colors.textSecondary} style={{ marginBottom: 12 }} />
            <Text style={[styles.emptyText, { color: colors.textSecondary, fontFamily: fonts.sans }]}>No words found</Text>
            <Text style={[styles.emptySubtext, { color: colors.textSecondary, fontFamily: fonts.sans }]}>Save words while reading to build your vocabulary</Text>
            <TouchableOpacity
              style={{ marginTop: 12, paddingVertical: 10, paddingHorizontal: 24, borderRadius: 8, borderWidth: 1, borderColor: colors.primary }}
              onPress={() => router.push('/(tabs)/')}
            >
              <Text style={{ color: colors.primary, fontFamily: fonts.sansMedium, fontSize: 14 }}>Browse Books</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={words}
            keyExtractor={item => item.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <WordRow
                word={item}
                expanded={expandedId === item.id}
                onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
                onDelete={() => handleDelete(item.id)}
              />
            )}
          />
        )}
      </View>
    </>
  )
}

function StatBox({ label, value, color }: { label: string; value: number; color?: string }) {
  const { colors } = useTheme()
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, { color: color || colors.text, fontFamily: fonts.serifBold }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textSecondary, fontFamily: fonts.sans }]}>{label}</Text>
    </View>
  )
}

function WordRow({
  word, expanded, onToggle, onDelete,
}: {
  word: VocabularyWordDto
  expanded: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  const { colors } = useTheme()
  const stageLabel = STAGE_LABELS[word.stage] || 'Unknown'
  const stageColor = STAGE_COLORS[word.stage] || '#9CA3AF'

  return (
    <TouchableOpacity style={[styles.wordRow, { borderBottomColor: colors.border }]} onPress={onToggle} activeOpacity={0.7}>
      <View style={styles.wordHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.wordText, { color: colors.text, fontFamily: fonts.sansMedium }]}>{word.word}</Text>
          {word.translation && (
            <Text style={[styles.wordTranslation, { color: colors.textSecondary, fontFamily: fonts.sans }]} numberOfLines={1}>{word.translation}</Text>
          )}
        </View>
        <View style={[styles.stageBadge, { backgroundColor: stageColor + '20' }]}>
          <Text style={[styles.stageText, { color: stageColor, fontFamily: fonts.sansMedium }]}>{stageLabel}</Text>
        </View>
      </View>

      {expanded && (
        <View style={[styles.wordDetail, { borderTopColor: colors.border }]}>
          {word.definition && (
            <Text style={[styles.detailText, { color: colors.text, fontFamily: fonts.sans }]}>Definition: {word.definition}</Text>
          )}
          {word.sentence && (
            <Text style={[styles.detailText, { color: colors.text, fontFamily: fonts.sans, fontStyle: 'italic' }]}>"{word.sentence}"</Text>
          )}
          {word.bookTitle && (
            <Text style={[styles.detailSource, { color: colors.textSecondary, fontFamily: fonts.sans }]}>From: {word.bookTitle}</Text>
          )}
          {word.hint && (
            <Text style={[styles.detailHint, { color: colors.primary, fontFamily: fonts.sans }]}>Hint: {word.hint}</Text>
          )}
          <Text style={[styles.detailDate, { color: colors.textSecondary, fontFamily: fonts.sans }]}>
            Added {new Date(word.createdAt).toLocaleDateString()}
            {word.nextReviewAt && ` · Review: ${new Date(word.nextReviewAt).toLocaleDateString()}`}
          </Text>
          <TouchableOpacity style={styles.deleteBtn} onPress={onDelete}>
            <Ionicons name="trash-outline" size={14} color="#DC2626" style={{ marginRight: 4 }} />
            <Text style={[styles.deleteBtnText, { fontFamily: fonts.sansMedium }]}>Delete Word</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyText: { fontSize: 16, textAlign: 'center' },
  emptySubtext: { fontSize: 13, marginTop: 4, textAlign: 'center' },

  // Stats
  statsBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
  },
  statBox: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 20 },
  statLabel: { fontSize: 11, marginTop: 2 },

  // Review button
  reviewBtn: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  reviewBtnText: { color: '#fff', fontSize: 15 },

  // Tabs
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 12,
    gap: 6,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
  },
  tabText: { fontSize: 13 },

  // Search
  searchInput: {
    margin: 16,
    marginBottom: 8,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
  },

  // List
  listContent: { paddingBottom: 20 },
  wordRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  wordHeader: { flexDirection: 'row', alignItems: 'center' },
  wordText: { fontSize: 16 },
  wordTranslation: { fontSize: 13, marginTop: 2 },
  stageBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  stageText: { fontSize: 11 },

  // Detail
  wordDetail: { marginTop: 10, paddingTop: 10, borderTopWidth: 1 },
  detailText: { fontSize: 13, marginBottom: 4 },
  detailSource: { fontSize: 12, marginBottom: 4 },
  detailHint: { fontSize: 12, marginBottom: 4, fontStyle: 'italic' },
  detailDate: { fontSize: 11, marginBottom: 8 },
  deleteBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
    flexDirection: 'row',
    alignItems: 'center',
  },
  deleteBtnText: { fontSize: 12, color: '#DC2626' },
})
