import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import { useRouter, Stack, useFocusEffect } from 'expo-router'
import { vocabularyApi } from '@textstack/shared'
import type { VocabularyWordDto, VocabularyStatsDto } from '@textstack/shared'
import { colors } from '../../src/theme/colors'

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
      <View style={styles.container}>
        {/* Stats bar */}
        {stats && (
          <View style={styles.statsBar}>
            <StatBox label="Total" value={stats.total} />
            <StatBox label="Due" value={dueCount} color={dueCount > 0 ? colors.primary : undefined} />
            <StatBox label="Mastered" value={stats.byStage[4] || 0} color="#10B981" />
          </View>
        )}

        {/* Review button */}
        {dueCount > 0 && (
          <TouchableOpacity
            style={styles.reviewBtn}
            onPress={() => router.push('/vocabulary/review')}
          >
            <Text style={styles.reviewBtnText}>Start Review ({dueCount})</Text>
          </TouchableOpacity>
        )}

        {/* Filter tabs */}
        <View style={styles.tabs}>
          {TABS.map(t => (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, tab === t.key && styles.tabActive]}
              onPress={() => setTab(t.key)}
            >
              <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Search */}
        <TextInput
          style={styles.searchInput}
          placeholder="Search words..."
          placeholderTextColor={colors.textSecondary}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : words.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>No words found</Text>
            <Text style={styles.emptySubtext}>Save words while reading to build your vocabulary</Text>
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
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, color ? { color } : undefined]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
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
  const stageLabel = STAGE_LABELS[word.stage] || 'Unknown'
  const stageColor = STAGE_COLORS[word.stage] || '#9CA3AF'

  return (
    <TouchableOpacity style={styles.wordRow} onPress={onToggle} activeOpacity={0.7}>
      <View style={styles.wordHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.wordText}>{word.word}</Text>
          {word.translation && (
            <Text style={styles.wordTranslation} numberOfLines={1}>{word.translation}</Text>
          )}
        </View>
        <View style={[styles.stageBadge, { backgroundColor: stageColor + '20' }]}>
          <Text style={[styles.stageText, { color: stageColor }]}>{stageLabel}</Text>
        </View>
      </View>

      {expanded && (
        <View style={styles.wordDetail}>
          {word.definition && (
            <Text style={styles.detailText}>Definition: {word.definition}</Text>
          )}
          {word.sentence && (
            <Text style={styles.detailText}>"{word.sentence}"</Text>
          )}
          {word.bookTitle && (
            <Text style={styles.detailSource}>From: {word.bookTitle}</Text>
          )}
          {word.hint && (
            <Text style={styles.detailHint}>Hint: {word.hint}</Text>
          )}
          <Text style={styles.detailDate}>
            Added {new Date(word.createdAt).toLocaleDateString()}
            {word.nextReviewAt && ` · Review: ${new Date(word.nextReviewAt).toLocaleDateString()}`}
          </Text>
          <TouchableOpacity style={styles.deleteBtn} onPress={onDelete}>
            <Text style={styles.deleteBtnText}>Delete Word</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyText: { fontSize: 16, color: colors.textSecondary, textAlign: 'center' },
  emptySubtext: { fontSize: 13, color: colors.textSecondary, marginTop: 4, textAlign: 'center' },

  // Stats
  statsBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statBox: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '700', color: colors.text },
  statLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },

  // Review button
  reviewBtn: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  reviewBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },

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
    backgroundColor: colors.surface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  tabTextActive: { color: '#fff' },

  // Search
  searchInput: {
    margin: 16,
    marginBottom: 8,
    height: 40,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    fontSize: 14,
    color: colors.text,
  },

  // List
  listContent: { paddingBottom: 20 },
  wordRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  wordHeader: { flexDirection: 'row', alignItems: 'center' },
  wordText: { fontSize: 16, fontWeight: '600', color: colors.text },
  wordTranslation: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  stageBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  stageText: { fontSize: 11, fontWeight: '600' },

  // Detail
  wordDetail: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  detailText: { fontSize: 13, color: colors.text, marginBottom: 4 },
  detailSource: { fontSize: 12, color: colors.textSecondary, marginBottom: 4 },
  detailHint: { fontSize: 12, color: colors.primary, marginBottom: 4, fontStyle: 'italic' },
  detailDate: { fontSize: 11, color: colors.textSecondary, marginBottom: 8 },
  deleteBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
  },
  deleteBtnText: { fontSize: 12, color: '#DC2626', fontWeight: '500' },
})
