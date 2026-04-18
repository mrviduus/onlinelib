import { useEffect, useState, useRef } from 'react'
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Share, Linking } from 'react-native'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { userBooksApi, getStorageUrl, getApiConfig } from '@textstack/shared'
import type { UserBookDetailResponse } from '@textstack/shared'
import { useTheme } from '../../src/context/ThemeContext'
import { useToast } from '../../src/context/ToastContext'
import { fonts } from '../../src/theme/typography'
import { MoodSelector } from '../../src/components/MoodSelector'
import { StarRating } from '../../src/components/StarRating'
import { LoadingScreen } from '../../src/components/ui/LoadingScreen'
import { trackBookOpened } from '../../src/lib/analytics'

export default function UserBookDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { colors } = useTheme()
  const { show: showToast } = useToast()
  const [book, setBook] = useState<UserBookDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [savedProgress, setSavedProgress] = useState<{ chapterSlug: string | null; percent: number | null } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unmountedRef = useRef(false)

  useEffect(() => {
    unmountedRef.current = false
    return () => { unmountedRef.current = true }
  }, [])

  useEffect(() => {
    if (!id) return
    ;(async () => {
      try {
        const [b, p] = await Promise.all([
          userBooksApi.getUserBook(id),
          userBooksApi.getUserBookProgress(id).catch(err => {
            // Progress failures are non-fatal (guest with no progress yet, offline),
            // but log so they don't hide real bugs (P3-2).
            console.warn('getUserBookProgress failed:', err)
            return null
          }),
        ])
        if (unmountedRef.current) return
        setBook(b)
        if (p) setSavedProgress({ chapterSlug: p.chapterSlug, percent: p.percent })
      } catch (e) {
        console.error('Failed to load user book:', e)
      } finally {
        if (!unmountedRef.current) setLoading(false)
      }
    })()
  }, [id])

  // Auto-refresh while processing. Uses recursive setTimeout (not setInterval)
  // so we can implement exponential backoff on repeated failures and avoid
  // hammering the API during an outage (P1-2). Stops immediately once status
  // leaves 'processing'. Guards against `id` going undefined mid-flight (P0-1).
  useEffect(() => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current)
      pollTimeoutRef.current = null
    }
    if (!id) return
    if (!book || book.status.toLowerCase() !== 'processing') return

    let cancelled = false
    let consecutiveFailures = 0
    let delayMs = 5000
    const MAX_DELAY_MS = 60_000
    const FAILURE_TOAST_THRESHOLD = 3

    const scheduleNext = () => {
      if (cancelled || unmountedRef.current) return
      pollTimeoutRef.current = setTimeout(tick, delayMs)
    }

    const tick = async () => {
      if (cancelled || unmountedRef.current) return
      // Re-check id every iteration — route params can change under us
      // (user backs out + taps another book) before a prior in-flight call resolves.
      if (!id) return
      try {
        const b = await userBooksApi.getUserBook(id)
        if (cancelled || unmountedRef.current) return
        consecutiveFailures = 0
        delayMs = 5000
        setBook(b)
        // If processing finished, the status-change effect dep will re-run
        // and tear this poll loop down; no need to schedule another tick.
        if (b.status.toLowerCase() === 'processing') scheduleNext()
      } catch (err) {
        if (cancelled || unmountedRef.current) return
        consecutiveFailures += 1
        console.warn(`Poll ${consecutiveFailures} failed for user book ${id}:`, err)
        if (consecutiveFailures === FAILURE_TOAST_THRESHOLD) {
          showToast({
            message: 'Still trying to check processing status…',
            variant: 'info',
            duration: 2600,
          })
        }
        // Exponential backoff: 5s → 10 → 20 → 40 → 60 (capped).
        delayMs = Math.min(delayMs * 2, MAX_DELAY_MS)
        scheduleNext()
      }
    }

    scheduleNext()
    return () => {
      cancelled = true
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current)
        pollTimeoutRef.current = null
      }
    }
  }, [book?.status, id, showToast])

  const isReady = book?.status.toLowerCase() === 'ready'
  const isFailed = book?.status.toLowerCase() === 'failed'
  const isProcessing = book && !isReady && !isFailed

  const continueSlug = savedProgress?.chapterSlug && book?.chapters?.find(c => c.slug === savedProgress.chapterSlug)
    ? savedProgress.chapterSlug
    : null

  const handleDelete = () => {
    if (!id) return
    Alert.alert('Delete Book', 'Are you sure you want to delete this book?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          if (deleting) return
          setDeleting(true)
          try {
            await userBooksApi.deleteUserBook(id)
            // Don't reset `deleting` on success — the screen unmounts on router.back()
            // and any lingering state change would warn. (P2-2)
            router.back()
          } catch (err) {
            console.warn('deleteUserBook failed:', err)
            // Surface the failure so the user knows retry is OK.
            showToast({
              message: "Couldn't delete this book. Try again.",
              variant: 'error',
              duration: 2600,
            })
            setDeleting(false)
          }
        },
      },
    ])
  }

  const handleMarkComplete = async () => {
    if (!book || !id) return
    const prevCompletedAt = book.completedAt
    // Optimistic UI — flip first, roll back on failure so the switch doesn't
    // look frozen and errors don't silently swallow the user's intent.
    const optimistic = prevCompletedAt
      ? { ...book, completedAt: null }
      : { ...book, completedAt: new Date().toISOString() }
    setBook(optimistic)
    try {
      if (prevCompletedAt) {
        await userBooksApi.unmarkUserBookComplete(id)
      } else {
        await userBooksApi.markUserBookComplete(id)
      }
    } catch (err) {
      console.warn('markUserBookComplete failed:', err)
      setBook({ ...book, completedAt: prevCompletedAt })
      showToast({
        message: "Couldn't update read status.",
        variant: 'error',
        duration: 2400,
      })
    }
  }

  const handleDownloadEpub = async () => {
    if (!id) return
    try {
      const { baseUrl } = getApiConfig()
      const url = `${baseUrl}/me/books/${id}/export/epub`
      // iOS/Android will hand the URL off to the system browser or a PDF/EPUB
      // reader. Linking.openURL can reject if no handler exists — surface a
      // toast rather than failing silently (B-76).
      const supported = await Linking.canOpenURL(url)
      if (!supported) {
        showToast({ message: "Can't open EPUB download on this device", variant: 'error' })
        return
      }
      await Linking.openURL(url)
    } catch (e) {
      console.warn('Download EPUB failed:', e)
      showToast({ message: 'Could not start EPUB download', variant: 'error' })
    }
  }

  const handleShare = async () => {
    try {
      await Share.share({
        message: `${book?.title || 'Book'}${book?.author ? ` — ${book.author}` : ''}`,
      })
    } catch (e) {
      // Share.share rejects with `ActivityDoesNotExist` on some Android
      // variants and a generic dismissal on iOS. Dismissal is expected, but
      // we still want the log to catch real failures — no toast here because
      // user-dismiss isn't an error they want to see reported.
      console.warn('Share failed:', e)
    }
  }

  if (loading || !book) {
    return <LoadingScreen />
  }

  const estPages = book.totalWordCount ? Math.round(book.totalWordCount / 250) : null
  const progressPct = savedProgress?.percent ? Math.round(savedProgress.percent * 100) : 0

  return (
    <>
      <Stack.Screen options={{
        title: book.title || 'My Book',
        headerShown: true,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerShadowVisible: false,
      }} />
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={styles.header}>
          <Image
            source={book.coverPath ? getStorageUrl(book.coverPath) : undefined}
            style={[styles.cover, { backgroundColor: colors.border }]}
            contentFit="cover"
          />
          <View style={styles.meta}>
            <Text style={[styles.title, { color: colors.text }]}>{book.title || 'Untitled'}</Text>
            {book.author && <Text style={[styles.author, { color: colors.textSecondary }]}>{book.author}</Text>}

            {/* Metadata chips */}
            <View style={styles.chipRow}>
              {isReady && <Chip icon="book-outline" text={`${book.chapters.length} ch`} colors={colors} />}
              {estPages && <Chip icon="document-text-outline" text={`~${estPages} pages`} colors={colors} />}
              {book.genre && <Chip icon="pricetag-outline" text={book.genre} colors={colors} />}
              {book.publishedYear && <Chip icon="calendar-outline" text={String(book.publishedYear)} colors={colors} />}
              {book.language && <Chip icon="globe-outline" text={book.language.toUpperCase()} colors={colors} />}
            </View>

            <StatusText status={book.status} colors={colors} />

            {book.completedAt && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                <Text style={{ fontSize: 12, color: colors.success, fontFamily: fonts.sansMedium }}>Read</Text>
              </View>
            )}
          </View>
        </View>

        {/* Description */}
        {book.description && (
          <View style={styles.descSection}>
            <Text style={[styles.descText, { color: colors.textSecondary }]}>{book.description}</Text>
          </View>
        )}

        {/* Progress bar */}
        {isReady && (
          <View style={styles.progressSection}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ fontSize: 13, color: colors.textSecondary, fontFamily: fonts.sans }}>Reading progress</Text>
              <Text style={{ fontSize: 13, color: colors.primary, fontFamily: fonts.sansMedium }}>{progressPct}%</Text>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
              <View style={[styles.progressFill, { width: `${progressPct}%`, backgroundColor: colors.primary }]} />
            </View>
          </View>
        )}

        {/* Error message */}
        {isFailed && book.errorMessage && (
          <View style={[styles.errorBox, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
            <Ionicons name="alert-circle" size={18} color="#DC2626" />
            <Text style={{ flex: 1, fontSize: 13, color: '#991B1B', fontFamily: fonts.sans }}>{book.errorMessage}</Text>
          </View>
        )}

        {/* Processing message */}
        {isProcessing && (
          <View style={[styles.processingBox, { backgroundColor: colors.primaryLight }]}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={{ fontSize: 13, color: colors.primary, fontFamily: fonts.sans }}>
              Processing... This may take a few minutes.
            </Text>
          </View>
        )}

        {/* Action buttons */}
        {isReady && book.chapters.length > 0 && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.readBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                const slug = continueSlug || book.chapters[0]?.slug || `chapter-${book.chapters[0]?.chapterNumber}`
                trackBookOpened({ source: 'userbook', userBookId: id })
                router.push(`/my-books/read/${id}/${slug}`)
              }}
            >
              <Ionicons name={continueSlug ? 'play' : 'book'} size={18} color="#fff" />
              <Text style={styles.readBtnText}>{continueSlug ? 'Continue Reading' : 'Start Reading'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Retry */}
        {isFailed && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.retryBtn, { backgroundColor: '#FEF3C7' }]}
              onPress={async () => {
                await userBooksApi.retryUserBook(id!).catch(() => {})
                setBook({ ...book, status: 'Processing' })
              }}
            >
              <Ionicons name="refresh" size={16} color="#92400E" />
              <Text style={styles.retryBtnText}>Retry Processing</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Secondary actions */}
        {isReady && (
          <View style={styles.secondaryActions}>
            <TouchableOpacity
              style={[styles.secondaryBtn, { borderColor: colors.border }]}
              onPress={handleMarkComplete}
              accessibilityRole="button"
              accessibilityLabel={book.completedAt ? 'Mark book as unread' : 'Mark book as read'}
              accessibilityState={{ selected: !!book.completedAt }}
            >
              <Ionicons name={book.completedAt ? 'close-circle-outline' : 'checkmark-circle-outline'} size={18} color={colors.text} />
              <Text style={[styles.secondaryBtnText, { color: colors.text }]}>
                {book.completedAt ? 'Mark as unread' : 'Mark as read'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryBtn, { borderColor: colors.border }]}
              onPress={handleDownloadEpub}
              accessibilityRole="button"
              accessibilityLabel="Download EPUB"
            >
              <Ionicons name="download-outline" size={18} color={colors.text} />
              <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Download EPUB</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryBtn, { borderColor: colors.border }]}
              onPress={handleShare}
              accessibilityRole="button"
              accessibilityLabel={`Share ${book.title || 'book'}`}
            >
              <Ionicons name="share-outline" size={18} color={colors.text} />
              <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Share</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Rating + Moods */}
        {isReady && (
          <View style={{ paddingHorizontal: 16, marginTop: 16, gap: 12 }}>
            <StarRating userBookId={id!} />
            <MoodSelector userBookId={id!} />
          </View>
        )}

        {/* Chapter list */}
        {isReady && book.chapters.length > 0 && (
          <View style={[styles.chaptersSection, { borderTopColor: colors.border }]}>
            <Text style={[styles.chaptersTitle, { color: colors.text }]}>Chapters</Text>
            {book.chapters.map((ch, i) => {
              const isCurrentChapter = continueSlug === ch.slug
              return (
                <TouchableOpacity
                  key={ch.id}
                  style={[styles.chapterRow, { borderBottomColor: colors.border }]}
                  onPress={() => router.push(`/my-books/read/${id}/${ch.slug || `chapter-${ch.chapterNumber}`}`)}
                >
                  <Text style={[styles.chapterNumber, { color: isCurrentChapter ? colors.primary : colors.textSecondary }]}>{i + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.chapterTitle, { color: isCurrentChapter ? colors.primary : colors.text }, isCurrentChapter && { fontFamily: fonts.sansMedium }]}
                      numberOfLines={1}
                    >
                      {ch.title}
                    </Text>
                    {ch.wordCount && (
                      <Text style={{ fontSize: 11, color: colors.textSecondary, fontFamily: fonts.sans, marginTop: 2 }}>
                        {ch.wordCount.toLocaleString()} words
                      </Text>
                    )}
                  </View>
                  {isCurrentChapter && <Ionicons name="play-circle" size={18} color={colors.primary} />}
                </TouchableOpacity>
              )
            })}
          </View>
        )}

        {/* Delete */}
        <View style={styles.dangerSection}>
          <TouchableOpacity
            style={[styles.deleteBtn, { borderColor: '#FECACA' }]}
            onPress={handleDelete}
            disabled={deleting}
          >
            <Ionicons name="trash-outline" size={16} color="#DC2626" />
            <Text style={{ fontSize: 14, color: '#DC2626', fontFamily: fonts.sansMedium }}>
              {deleting ? 'Deleting...' : 'Delete Book'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </>
  )
}

function Chip({ icon, text, colors }: { icon: string; text: string; colors: any }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.border }}>
      <Ionicons name={icon as any} size={12} color={colors.textSecondary} />
      <Text style={{ fontSize: 11, color: colors.textSecondary, fontFamily: fonts.sans }}>{text}</Text>
    </View>
  )
}

function StatusText({ status, colors }: { status: string; colors: any }) {
  const s = status.toLowerCase()
  if (s === 'ready') return null
  if (s === 'failed') return <Text style={[styles.statusFail, { color: '#DC2626' }]}>Failed</Text>
  return <Text style={[styles.statusPending, { color: colors.primary }]}>Processing...</Text>
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1 },
  header: { flexDirection: 'row', padding: 16 },
  cover: { width: 110, height: 165, borderRadius: 8 },
  meta: { flex: 1, marginLeft: 16, justifyContent: 'center' },
  title: { fontSize: 18, fontFamily: fonts.serifBold },
  author: { fontSize: 14, fontFamily: fonts.sans, marginTop: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  descSection: { paddingHorizontal: 16, marginBottom: 12 },
  descText: { fontSize: 13, fontFamily: fonts.sans, lineHeight: 20 },
  progressSection: { paddingHorizontal: 16, marginBottom: 12 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  errorBox: { marginHorizontal: 16, marginBottom: 12, padding: 12, borderRadius: 8, borderWidth: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  processingBox: { marginHorizontal: 16, marginBottom: 12, padding: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  actions: { paddingHorizontal: 16, marginTop: 4, gap: 8 },
  readBtn: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  readBtnText: { color: '#fff', fontSize: 16, fontFamily: fonts.sansMedium },
  retryBtn: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  retryBtnText: { fontSize: 14, color: '#92400E', fontFamily: fonts.sansMedium },
  secondaryActions: { paddingHorizontal: 16, marginTop: 12, gap: 8 },
  secondaryBtn: {
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  secondaryBtnText: { fontSize: 14, fontFamily: fonts.sansMedium },
  statusFail: { fontSize: 12, marginTop: 6, fontFamily: fonts.sansMedium },
  statusPending: { fontSize: 12, marginTop: 6, fontFamily: fonts.sansMedium },
  chaptersSection: { paddingHorizontal: 16, marginTop: 20, borderTopWidth: 1, paddingTop: 16 },
  chaptersTitle: { fontSize: 16, fontFamily: fonts.serifBold, marginBottom: 12 },
  chapterRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, gap: 4 },
  chapterNumber: { width: 28, fontSize: 13, fontFamily: fonts.sansMedium },
  chapterTitle: { fontSize: 14, fontFamily: fonts.sans },
  dangerSection: { paddingHorizontal: 16, marginTop: 24 },
  deleteBtn: {
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
})
