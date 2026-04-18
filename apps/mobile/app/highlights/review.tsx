import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native'
import { Stack, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { highlightsApi } from '@textstack/shared'
import type { HighlightReviewItem } from '@textstack/shared'
import { useTheme } from '../../src/context/ThemeContext'
import { fonts } from '../../src/theme/typography'

const HIGHLIGHT_COLORS: Record<string, string> = {
  yellow: '#FEF3C7',
  green: '#D1FAE5',
  pink: '#FCE7F3',
  blue: '#DBEAFE',
}

export default function HighlightReviewScreen() {
  const router = useRouter()
  const { colors } = useTheme()
  const [items, setItems] = useState<HighlightReviewItem[]>([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [done, setDone] = useState(false)
  const [reviewed, setReviewed] = useState(0)

  useEffect(() => {
    // The review screen is short-lived — user can back-gesture mid-fetch,
    // at which point setItems / setLoading would warn. Cancellation flag
    // keeps state updates bound to the current mount.
    let cancelled = false
    highlightsApi.getHighlightsForReview(20)
      .then(res => { if (!cancelled) setItems(res) })
      .catch(e => { if (!cancelled) console.warn('Failed to load review items:', e) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => {
      cancelled = true
    }
  }, [])

  const current = items[index]

  const handleNext = async () => {
    if (current) {
      try {
        await highlightsApi.markHighlightReviewed(current.id)
      } catch (e) {
        // Non-fatal — review progress is a convenience, not a hard state.
        // Log so QA can spot bursts of failures, but keep the flow moving.
        console.warn('Failed to mark highlight reviewed:', e)
      }
      setReviewed(r => r + 1)
    }
    if (index < items.length - 1) {
      setIndex(i => i + 1)
    } else {
      setDone(true)
    }
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Review Highlights', headerShown: true }} />
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      </>
    )
  }

  if (items.length === 0) {
    return (
      <>
        <Stack.Screen options={{ title: 'Review Highlights', headerShown: true, headerStyle: { backgroundColor: colors.background }, headerShadowVisible: false }} />
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <Ionicons name="checkmark-circle-outline" size={48} color={colors.success} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>All caught up! No highlights to review.</Text>
        </View>
      </>
    )
  }

  // Summary screen after completing all cards
  if (done) {
    return (
      <>
        <Stack.Screen options={{ title: 'Review Complete', headerShown: true, headerStyle: { backgroundColor: colors.background }, headerShadowVisible: false }} />
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <Ionicons name="checkmark-circle" size={56} color={colors.success} />
          <Text style={[styles.summaryTitle, { color: colors.text }]}>Review Complete</Text>
          <Text style={[styles.summaryCount, { color: colors.textSecondary }]}>
            Reviewed {reviewed} highlight{reviewed !== 1 ? 's' : ''}
          </Text>
          <TouchableOpacity
            style={[styles.summaryBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.back()}
          >
            <Text style={styles.summaryBtnText}>Back to Highlights</Text>
          </TouchableOpacity>
        </View>
      </>
    )
  }

  const bgColor = HIGHLIGHT_COLORS[current.color] || HIGHLIGHT_COLORS.yellow

  return (
    <>
      <Stack.Screen options={{
        title: `${index + 1} / ${items.length}`,
        headerShown: true,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerShadowVisible: false,
      }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.card, { backgroundColor: bgColor }]}>
          <Text style={[styles.quoteText, { color: colors.text }]}>
            "{current.selectedText}"
          </Text>
          <Text style={[styles.flipHint, { color: colors.textSecondary }]}>Tap Next to continue</Text>
          {current.noteText && (
            <Text style={[styles.noteText, { color: colors.textSecondary }]}>{current.noteText}</Text>
          )}
          <View style={styles.meta}>
            {current.bookTitle && (
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>{current.bookTitle}</Text>
            )}
            {current.chapterTitle && (
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>{current.chapterTitle}</Text>
            )}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.nextButton, { backgroundColor: colors.primary }]}
          onPress={handleNext}
          activeOpacity={0.85}
        >
          <Text style={styles.nextText}>
            {index < items.length - 1 ? 'Next' : 'Done'}
          </Text>
          <Ionicons name={index < items.length - 1 ? 'arrow-forward' : 'checkmark'} size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 24 },
  card: { borderRadius: 16, padding: 24, marginBottom: 32 },
  quoteText: { fontFamily: fonts.serif, fontSize: 20, lineHeight: 30, fontStyle: 'italic', textAlign: 'center' },
  flipHint: { fontFamily: fonts.sans, fontSize: 12, textAlign: 'center', marginTop: 8 },
  noteText: { fontFamily: fonts.sans, fontSize: 14, marginTop: 16, textAlign: 'center' },
  meta: { marginTop: 20, alignItems: 'center', gap: 2 },
  metaText: { fontFamily: fonts.sans, fontSize: 12 },
  nextButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
  nextText: { color: '#fff', fontFamily: fonts.sansMedium, fontSize: 16 },
  emptyText: { fontFamily: fonts.sans, fontSize: 15, textAlign: 'center' },
  summaryTitle: { fontFamily: fonts.serifBold, fontSize: 24, marginTop: 12 },
  summaryCount: { fontFamily: fonts.sans, fontSize: 15 },
  summaryBtn: { marginTop: 24, paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12 },
  summaryBtnText: { color: '#fff', fontFamily: fonts.sansMedium, fontSize: 16 },
})
