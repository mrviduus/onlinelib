import { useEffect, useState, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  RefreshControl,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter, useFocusEffect } from 'expo-router'
import { vocabularyApi, getVocabLevel } from '@textstack/shared'
import type { VocabularyWordDto, VocabularyStatsDto, PendingVocabWordDto, WordLookupDto } from '@textstack/shared'
import { useTheme } from '../../src/context/ThemeContext'
import { useLanguage } from '../../src/context/LanguageContext'
import { useToast } from '../../src/context/ToastContext'
import { fonts } from '../../src/theme/typography'
import { SkeletonLoader } from '../../src/components/ui/SkeletonLoader'
import { EmptyState } from '../../src/components/ui/EmptyState'
import { PressableScale } from '../../src/components/ui/PressableScale'
import { useTts } from '../../src/hooks/useTts'
import type { ReviewMode } from '../../src/hooks/useVocabularyReview'
import { ClusterBonusCard } from '../../src/components/vocabulary/ClusterBonusCard'
import { WeeklyBudgetBar } from '../../src/components/vocabulary/WeeklyBudgetBar'

const STAGE_LABELS = ['New', 'Recognition', 'Recall', 'Context', 'Mastered']
const STAGE_COLORS = ['#9CA3AF', '#3B82F6', '#F59E0B', '#8B5CF6', '#10B981']

const TABS = [
  { key: 'all', label: 'All', filter: undefined },
  { key: 'new', label: 'New', filter: '0' },
  { key: 'learning', label: 'Learning', filter: '1,2,3' },
  { key: 'mastered', label: 'Mastered', filter: '4' },
  { key: 'pending', label: 'Pending', filter: undefined },
  { key: 'lookups', label: 'Lookups', filter: undefined },
] as const

const SORT_OPTIONS = [
  { key: 'recent', label: 'Recent' },
  { key: 'alphabetical', label: 'A-Z' },
  { key: 'due', label: 'Due' },
  { key: 'stage', label: 'Stage' },
] as const

type TabKey = typeof TABS[number]['key']
type SortKey = typeof SORT_OPTIONS[number]['key']

export default function VocabularyScreen() {
  const { colors } = useTheme()
  const { t } = useLanguage()
  const router = useRouter()
  const { toggle: toggleTts } = useTts()
  const { show: showToast } = useToast()
  const [words, setWords] = useState<VocabularyWordDto[]>([])
  const [stats, setStats] = useState<VocabularyStatsDto | null>(null)
  const [tab, setTab] = useState<TabKey>('all')
  const [sort, setSort] = useState<SortKey>('recent')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [reviewMode, setReviewMode] = useState<ReviewMode>('classic')
  const [pendingItems, setPendingItems] = useState<PendingVocabWordDto[] | null>(null)
  const [pendingBusyId, setPendingBusyId] = useState<string | null>(null)
  const [lookupItems, setLookupItems] = useState<WordLookupDto[] | null>(null)
  const [lookupBusyId, setLookupBusyId] = useState<string | null>(null)

  const activeFilter = TABS.find(t => t.key === tab)?.filter

  const offsetRef = useRef(0)
  // Tracks the newest loadData call. Prevents stale filter/search responses
  // from overwriting current results when the user types quickly or flips
  // tabs mid-flight (B-10). Set to -1 on unmount.
  const loadGenRef = useRef(0)
  // Blocks re-entrant loadData(true) from `onEndReached` — FlatList can fire
  // the callback multiple times while a fetch is in flight on short lists.
  const loadingMoreRef = useRef(false)
  useEffect(() => () => { loadGenRef.current = -1 }, [])

  const loadData = useCallback(async (loadMore = false) => {
    if (loadMore && loadingMoreRef.current) return
    if (loadMore) loadingMoreRef.current = true
    const myGen = ++loadGenRef.current
    try {
      const currentOffset = loadMore ? offsetRef.current : 0
      const [res, st] = await Promise.all([
        vocabularyApi.getWords({ stage: activeFilter, search: search || undefined, sort, limit: 50, offset: currentOffset }),
        loadMore ? Promise.resolve(null) : vocabularyApi.getVocabularyStats(),
      ])
      if (myGen !== loadGenRef.current) return
      if (loadMore) {
        setWords(prev => [...prev, ...res.items])
      } else {
        setWords(res.items)
      }
      setTotal(res.total)
      offsetRef.current = currentOffset + res.items.length
      if (!loadMore && st) setStats(st)
    } catch (e) {
      if (myGen !== loadGenRef.current) return
      console.warn('Vocab load error:', e)
    } finally {
      if (loadMore) loadingMoreRef.current = false
      if (myGen === loadGenRef.current) setLoading(false)
    }
  }, [activeFilter, search, sort])

  useEffect(() => { setLoading(true); offsetRef.current = 0; loadData() }, [loadData])

  const loadPending = useCallback(async () => {
    try {
      const resp = await vocabularyApi.getPendingWords()
      setPendingItems(resp.items)
    } catch (e) {
      console.warn('Load pending failed:', e)
      setPendingItems([])
    }
  }, [])

  useEffect(() => {
    if (tab === 'pending') loadPending()
  }, [tab, loadPending])

  const loadLookups = useCallback(async () => {
    try {
      const resp = await vocabularyApi.getLookups({ limit: 200 })
      setLookupItems(resp.items)
    } catch (e) {
      console.warn('Load lookups failed:', e)
      setLookupItems([])
    }
  }, [])

  useEffect(() => {
    if (tab === 'lookups') loadLookups()
  }, [tab, loadLookups])

  const handlePromoteLookup = async (id: string) => {
    setLookupBusyId(id)
    try {
      await vocabularyApi.promoteLookup(id)
      setLookupItems(prev => (prev || []).filter(p => p.id !== id))
      vocabularyApi.getVocabularyStats().then(setStats).catch(() => {})
    } catch {
      showToast({ message: 'Could not promote. Try again.', variant: 'error' })
    } finally {
      setLookupBusyId(null)
    }
  }

  const handleDismissLookup = async (id: string) => {
    setLookupBusyId(id)
    try {
      await vocabularyApi.dismissLookup(id)
      setLookupItems(prev => (prev || []).filter(p => p.id !== id))
      vocabularyApi.getVocabularyStats().then(setStats).catch(() => {})
    } catch {
      showToast({ message: 'Could not dismiss. Try again.', variant: 'error' })
    } finally {
      setLookupBusyId(null)
    }
  }

  const handlePromotePending = async (id: string) => {
    setPendingBusyId(id)
    try {
      await vocabularyApi.promotePendingWord(id)
      setPendingItems(prev => (prev || []).filter(p => p.id !== id))
      vocabularyApi.getVocabularyStats().then(setStats).catch(() => {})
    } catch (e) {
      showToast({ message: 'Could not promote. Try again.', variant: 'error' })
    } finally {
      setPendingBusyId(null)
    }
  }

  const handleDismissPending = async (id: string) => {
    setPendingBusyId(id)
    try {
      await vocabularyApi.dismissPendingWord(id)
      setPendingItems(prev => (prev || []).filter(p => p.id !== id))
      vocabularyApi.getVocabularyStats().then(setStats).catch(() => {})
    } catch (e) {
      showToast({ message: 'Could not dismiss. Try again.', variant: 'error' })
    } finally {
      setPendingBusyId(null)
    }
  }

  useFocusEffect(useCallback(() => {
    if (!loading) { offsetRef.current = 0; loadData() }
  }, [loading, loadData]))

  const onRefresh = async () => {
    setRefreshing(true)
    offsetRef.current = 0
    await loadData()
    setRefreshing(false)
  }

  const handleDelete = async (id: string) => {
    // Optimistic remove + rollback on error. Prior impl silently swallowed
    // failures — the row stayed, user tapped again thinking nothing happened,
    // spamming the API. Snapshot → filter → rollback + toast if API rejects.
    const snapshot = words
    const snapshotTotal = total
    setWords(prev => prev.filter(w => w.id !== id))
    setTotal(prev => prev - 1)
    setExpandedId(null)
    try {
      await vocabularyApi.deleteWord(id)
    } catch (e) {
      console.warn('Delete vocab word failed:', e)
      setWords(snapshot)
      setTotal(snapshotTotal)
      showToast({ message: 'Could not delete word. Try again.', variant: 'error' })
    }
  }

  const handleEdit = async (id: string, data: { translation?: string; definition?: string }) => {
    try {
      const updated = await vocabularyApi.updateWord(id, data)
      setWords(prev => prev.map(w => w.id === id ? updated : w))
    } catch (e) {
      console.warn('Edit vocab word failed:', e)
      showToast({ message: 'Could not save changes. Try again.', variant: 'error' })
    }
  }

  const dueCount = stats?.dueNow ?? 0
  const hasMore = words.length < total

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Anti-spiral F5: weekly budget replaces "Review Due: 847" panic number */}
      {stats?.weeklyProgress && <WeeklyBudgetBar progress={stats.weeklyProgress} />}

      {/* Cluster bonus card — only when an active, non-dismissed cluster exists */}
      {stats && (stats.clusterCount ?? 0) > 0 && (
        <ClusterBonusCard onChange={() => { offsetRef.current = 0; loadData() }} />
      )}

      {/* Stats bar */}
      {stats && (
        <View style={[styles.statsBar, { borderBottomColor: colors.border }]}>
          <StatBox label="Total" value={stats.totalWords} />
          <StatBox label="Due" value={dueCount} color={dueCount > 0 ? colors.primary : undefined} />
          <StatBox label="Mastered" value={stats.byStage.mastered || 0} color="#10B981" />
          <StatBox label="Streak" value={stats.streak || 0} color={stats.streak > 0 ? '#F59E0B' : undefined} />
          {getVocabLevel(stats.byStage.mastered).level > 0 && (
            <StatBox label="Level" value={getVocabLevel(stats.byStage.mastered).label} color="#8B5CF6" />
          )}
          {stats.practicedToday > 0 && <StatBox label="Practiced" value={stats.practicedToday} color={colors.primary} />}
        </View>
      )}

      {/* Mode selector + Review/Practice buttons */}
      {stats && stats.totalWords > 0 && (
        <>
          <View style={[styles.modeToggle, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {(['blitz', 'classic'] as ReviewMode[]).map(m => (
              <PressableScale
                key={m}
                onPress={() => setReviewMode(m)}
                style={[styles.modeToggleItem, reviewMode === m && { backgroundColor: colors.primary }]}
              >
                <Ionicons
                  name={m === 'blitz' ? 'flash' : 'layers'}
                  size={14}
                  color={reviewMode === m ? '#fff' : colors.textSecondary}
                />
                <Text style={[styles.modeToggleText, { color: reviewMode === m ? '#fff' : colors.textSecondary }]}>
                  {m === 'blitz' ? 'Blitz' : 'Flashcards'}
                </Text>
              </PressableScale>
            ))}
          </View>
          {dueCount > 0 && (
            <View style={styles.reviewRow}>
              <TouchableOpacity
                style={[styles.reviewBtn, { backgroundColor: colors.primary, flex: 1 }]}
                onPress={() => router.push(`/vocabulary/review?reviewMode=${reviewMode}`)}
              >
                <Ionicons name="school-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                <Text style={[styles.reviewBtnText, { fontFamily: fonts.sansMedium }]}>Practice ({dueCount})</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
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

      {/* Search + Sort row */}
      <View style={styles.searchSortRow}>
        <TextInput
          style={[styles.searchInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text, fontFamily: fonts.sans }]}
          placeholder="Search words..."
          placeholderTextColor={colors.textSecondary}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={styles.sortRow}>
          {SORT_OPTIONS.map(s => (
            <TouchableOpacity
              key={s.key}
              onPress={() => setSort(s.key)}
              style={[styles.sortChip, sort === s.key && { backgroundColor: colors.primaryLight }]}
            >
              <Text style={[styles.sortText, { color: sort === s.key ? colors.primary : colors.textSecondary, fontFamily: fonts.sans }]}>
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {tab === 'lookups' ? (
        lookupItems === null ? (
          <View style={styles.listContent}>
            {Array.from({ length: 4 }).map((_, i) => (
              <View key={i} style={[styles.wordRow, { borderBottomColor: colors.border }]}>
                <SkeletonLoader width={160} height={16} />
              </View>
            ))}
          </View>
        ) : lookupItems.length === 0 ? (
          <EmptyState icon="search-outline" title="No reference lookups yet" />
        ) : (
          <FlatList
            data={lookupItems}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View style={[styles.wordRow, { borderBottomColor: colors.border }]}>
                <View style={styles.wordHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.wordText, { color: colors.text, fontFamily: fonts.sansMedium }]}>{item.word}</Text>
                    {item.lastTranslation && (
                      <Text style={[styles.wordTranslation, { color: colors.textSecondary, fontFamily: fonts.sans }]} numberOfLines={1}>{item.lastTranslation}</Text>
                    )}
                    <Text style={[styles.detailSource, { color: colors.textSecondary, fontFamily: fonts.sans }]} numberOfLines={1}>
                      {[item.bookTitle, `${item.tapCount} tap${item.tapCount === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity
                      disabled={lookupBusyId === item.id}
                      style={[styles.reviewBtn, { backgroundColor: colors.primary, paddingHorizontal: 10, paddingVertical: 6 }]}
                      onPress={() => handlePromoteLookup(item.id)}
                    >
                      <Text style={{ color: '#fff', fontFamily: fonts.sansMedium, fontSize: 12 }}>Add anyway</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      disabled={lookupBusyId === item.id}
                      style={[styles.reviewBtn, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 }]}
                      onPress={() => handleDismissLookup(item.id)}
                    >
                      <Text style={{ color: colors.textSecondary, fontFamily: fonts.sans, fontSize: 12 }}>Dismiss</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
          />
        )
      ) : tab === 'pending' ? (
        pendingItems === null ? (
          <View style={styles.listContent}>
            {Array.from({ length: 4 }).map((_, i) => (
              <View key={i} style={[styles.wordRow, { borderBottomColor: colors.border }]}>
                <SkeletonLoader width={160} height={16} />
              </View>
            ))}
          </View>
        ) : pendingItems.length === 0 ? (
          <EmptyState icon="hourglass-outline" title="No words waiting" />
        ) : (
          <FlatList
            data={pendingItems}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View style={[styles.wordRow, { borderBottomColor: colors.border }]}>
                <View style={styles.wordHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.wordText, { color: colors.text, fontFamily: fonts.sansMedium }]}>{item.word}</Text>
                    {item.translation && (
                      <Text style={[styles.wordTranslation, { color: colors.textSecondary, fontFamily: fonts.sans }]} numberOfLines={1}>{item.translation}</Text>
                    )}
                    {item.bookTitle && (
                      <Text style={[styles.detailSource, { color: colors.textSecondary, fontFamily: fonts.sans }]} numberOfLines={1}>From: {item.bookTitle}</Text>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity
                      disabled={pendingBusyId === item.id}
                      style={[styles.reviewBtn, { backgroundColor: colors.primary, paddingHorizontal: 10, paddingVertical: 6 }]}
                      onPress={() => handlePromotePending(item.id)}
                    >
                      <Text style={{ color: '#fff', fontFamily: fonts.sansMedium, fontSize: 12 }}>Add</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      disabled={pendingBusyId === item.id}
                      style={[styles.reviewBtn, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 }]}
                      onPress={() => handleDismissPending(item.id)}
                    >
                      <Text style={{ color: colors.textSecondary, fontFamily: fonts.sans, fontSize: 12 }}>Dismiss</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
          />
        )
      ) : loading ? (
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
        <EmptyState
          icon="book-outline"
          title={t('vocabulary.empty')}
          buttonLabel={t('library.browseBooks')}
          onButtonPress={() => router.push('/(tabs)/search')}
        />
      ) : (
        <FlatList
          data={words}
          keyExtractor={item => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.listContent}
          onEndReached={() => { if (hasMore && !loading) loadData(true) }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={hasMore ? (
            <Text style={{ textAlign: 'center', padding: 12, fontSize: 12, color: colors.textSecondary, fontFamily: fonts.sans }}>
              {words.length} of {total} words
            </Text>
          ) : null}
          renderItem={({ item }) => (
            <WordRow
              word={item}
              expanded={expandedId === item.id}
              onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
              onDelete={() => handleDelete(item.id)}
              onEdit={(data) => handleEdit(item.id, data)}
              onSpeak={(text) => toggleTts(text, { lang: item.language })}
            />
          )}
        />
      )}
    </View>
  )
}

function StatBox({ label, value, color }: { label: string; value: number | string; color?: string }) {
  const { colors } = useTheme()
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, { color: color || colors.text, fontFamily: fonts.serifBold }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textSecondary, fontFamily: fonts.sans }]}>{label}</Text>
    </View>
  )
}

function ContextSnippet({ sentence, word }: { sentence: string; word: string }) {
  const { colors } = useTheme()
  const lower = sentence.toLowerCase()
  const idx = lower.indexOf(word.toLowerCase())
  if (idx === -1) {
    return <Text style={[styles.contextText, { color: colors.textSecondary }]} numberOfLines={1}>{sentence}</Text>
  }
  const before = sentence.slice(0, idx)
  const match = sentence.slice(idx, idx + word.length)
  const after = sentence.slice(idx + word.length)
  // Trim to ~35 chars each side
  const trimBefore = before.length > 35 ? '...' + before.slice(-35) : before
  const trimAfter = after.length > 35 ? after.slice(0, 35) + '...' : after
  return (
    <Text style={[styles.contextText, { color: colors.textSecondary }]} numberOfLines={1}>
      {trimBefore}<Text style={{ fontFamily: fonts.sansBold, color: colors.text }}>{match}</Text>{trimAfter}
    </Text>
  )
}

function WordRow({
  word, expanded, onToggle, onDelete, onEdit, onSpeak,
}: {
  word: VocabularyWordDto
  expanded: boolean
  onToggle: () => void
  onDelete: () => void
  onEdit: (data: { translation?: string; definition?: string }) => void
  onSpeak: (text: string) => void
}) {
  const { colors } = useTheme()
  const [editField, setEditField] = useState<'translation' | 'definition' | null>(null)
  const [editValue, setEditValue] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleDeletePress = () => {
    if (confirmingDelete) {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
      onDelete()
    } else {
      setConfirmingDelete(true)
      deleteTimerRef.current = setTimeout(() => setConfirmingDelete(false), 3000)
    }
  }

  const startEdit = (field: 'translation' | 'definition') => {
    setEditField(field)
    setEditValue(field === 'translation' ? (word.translation || '') : (word.definition || ''))
  }

  const handleSaveEdit = () => {
    if (!editField) return
    onEdit({ [editField]: editValue.trim() || undefined })
    setEditField(null)
  }
  const stageLabel = STAGE_LABELS[word.stage] || 'Unknown'
  const stageColor = STAGE_COLORS[word.stage] || '#9CA3AF'

  return (
    <TouchableOpacity style={[styles.wordRow, { borderBottomColor: colors.border }]} onPress={onToggle} activeOpacity={0.7}>
      <View style={styles.wordHeader}>
        <TouchableOpacity onPress={() => onSpeak(word.word)} hitSlop={8} style={{ padding: 2, marginRight: 6 }}>
          <Ionicons name="volume-medium-outline" size={16} color={colors.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.wordText, { color: colors.text, fontFamily: fonts.sansMedium }]}>{word.word}</Text>
          {word.sentence && !expanded ? (
            <ContextSnippet sentence={word.sentence} word={word.word} />
          ) : word.translation && !editField ? (
            <Text style={[styles.wordTranslation, { color: colors.textSecondary, fontFamily: fonts.sans }]} numberOfLines={1}>{word.translation}</Text>
          ) : null}
        </View>
        {!expanded && (
          <View style={[styles.stageBadge, { backgroundColor: stageColor + '20' }]}>
            <Text style={[styles.stageText, { color: stageColor, fontFamily: fonts.sansMedium }]}>{stageLabel}</Text>
          </View>
        )}
      </View>

      {expanded && (
        <View style={[styles.wordDetail, { borderTopColor: colors.border }]}>
          {/* Stage badge in expanded view */}
          <View style={[styles.stageBadge, { backgroundColor: stageColor + '20', alignSelf: 'flex-start', marginBottom: 8 }]}>
            <Text style={[styles.stageText, { color: stageColor, fontFamily: fonts.sansMedium }]}>{stageLabel}</Text>
          </View>
          {/* Edit translation / definition */}
          {editField ? (
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              <TextInput
                style={[styles.editInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text, fontFamily: fonts.sans }]}
                value={editValue}
                onChangeText={setEditValue}
                autoFocus
                onSubmitEditing={handleSaveEdit}
                placeholder={editField === 'translation' ? 'Translation...' : 'Definition...'}
                placeholderTextColor={colors.textSecondary}
              />
              <TouchableOpacity style={[styles.editSaveBtn, { backgroundColor: colors.primary }]} onPress={handleSaveEdit}>
                <Text style={{ color: '#fff', fontFamily: fonts.sansMedium, fontSize: 13 }}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditField(null)}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 8 }}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                onPress={() => startEdit('translation')}
              >
                <Ionicons name="pencil-outline" size={14} color={colors.primary} />
                <Text style={{ fontSize: 12, color: colors.primary, fontFamily: fonts.sansMedium }}>
                  {word.translation ? 'Edit translation' : 'Add translation'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                onPress={() => startEdit('definition')}
              >
                <Ionicons name="pencil-outline" size={14} color={colors.primary} />
                <Text style={{ fontSize: 12, color: colors.primary, fontFamily: fonts.sansMedium }}>
                  {word.definition ? 'Edit definition' : 'Add definition'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

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
            {word.totalReviews > 0 && ` · ${word.totalReviews} reviews (${word.correctReviews > 0 ? Math.round(word.correctReviews / word.totalReviews * 100) : 0}%)`}
            {word.nextReviewAt && ` · Due: ${new Date(word.nextReviewAt).toLocaleDateString()}`}
          </Text>
          <TouchableOpacity style={[styles.deleteBtn, confirmingDelete && { backgroundColor: '#DC2626' }]} onPress={handleDeletePress}>
            <Ionicons name="trash-outline" size={14} color={confirmingDelete ? '#fff' : '#DC2626'} style={{ marginRight: 4 }} />
            <Text style={[styles.deleteBtnText, { fontFamily: fonts.sansMedium }, confirmingDelete && { color: '#fff' }]}>
              {confirmingDelete ? 'Confirm Delete' : 'Delete Word'}
            </Text>
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

  // Mode toggle
  modeToggle: { flexDirection: 'row', marginHorizontal: 16, marginTop: 12, borderRadius: 10, borderWidth: 1, overflow: 'hidden' },
  modeToggleItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 9 },
  modeToggleText: { fontSize: 14, fontFamily: 'Inter-Medium' },
  // Context snippet
  contextText: { fontSize: 12, fontFamily: 'Inter-Regular', marginTop: 2 },
  // Review buttons
  reviewRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 8,
    gap: 8,
  },
  reviewBtn: {
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

  // Search + Sort
  searchSortRow: { paddingHorizontal: 16, marginTop: 12 },
  searchInput: {
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  sortRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  sortChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  sortText: { fontSize: 12 },

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
  editInput: {
    flex: 1,
    height: 36,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 13,
  },
  editSaveBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    justifyContent: 'center',
  },
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
