import { useState, useRef, useEffect, useCallback } from 'react'
import {
  View, Text, Modal, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { ragApi, ApiError, type AskCitation, type AskTarget, type RagIndexStatus } from '@textstack/shared'
import { useTheme } from '../context/ThemeContext'
import { useLanguage } from '../context/LanguageContext'
import { fonts } from '../theme/typography'

interface AskTurn {
  question: string
  answer: string
  citations: AskCitation[]
  insufficient: boolean
}

interface AskSheetProps {
  visible: boolean
  /** What the panel asks against — catalog edition or user-uploaded book (AI-027 P2). */
  target?: AskTarget
  isAuthenticated: boolean
  onCitation: (citation: AskCitation) => void
  onSignIn: () => void
  onClose: () => void
}

const POLL_INTERVAL_MS = 3000
/**
 * Stall window: fail only if the index makes NO forward progress for this
 * long. A large book under embedding rate limits can take well over 5 min
 * while still advancing, so we no longer use a flat wall-clock cap. Each
 * poll that shows progress (embeddedCount up, or chunkCount 0 -> >0) resets
 * the stall timer; we surface Failed only when the indexer is genuinely stuck.
 */
const POLL_STALL_MS = 90 * 1000

/**
 * A real "your session expired" 401 — the shared `authFetch` already retried
 * after a refresh and only throws `ApiError(401)` when that refresh failed.
 * Network blips surface as `ApiError(0, isNetworkError)`, so we branch on the
 * status, NOT on `instanceof ApiError` alone, to keep transient errors polling.
 */
function isAuthError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401
}

/** Endpoint pair for the target kind (catalog vs user-uploaded). */
function endpointsFor(target: AskTarget) {
  if (target.kind === 'userbook') {
    return {
      ask: ragApi.askUserBook,
      getStatus: ragApi.getUserIndexStatus,
      prepare: ragApi.prepareUserIndex,
    }
  }
  return {
    ask: ragApi.ask,
    getStatus: ragApi.getIndexStatus,
    prepare: ragApi.prepareIndex,
  }
}

export function AskSheet({
  visible, target, isAuthenticated, onCitation, onSignIn, onClose,
}: AskSheetProps) {
  const { colors } = useTheme()
  const { t } = useLanguage()
  const [history, setHistory] = useState<AskTurn[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // On-demand index gate (AI-027). Composer is enabled only when 'Ready'.
  const [indexStatus, setIndexStatus] = useState<RagIndexStatus>('NotIndexed')
  const [indexError, setIndexError] = useState('')
  /** 503 from /ask — Ask not configured (no OpenAI key). Distinct from index Failed. */
  const [notConfigured, setNotConfigured] = useState(false)
  /**
   * A 401 surfaced from a poll/ask after the shared refresh failed: the token
   * truly expired. Force the sign-in CTA so the user can re-auth instead of
   * watching the poll spin to a false timeout.
   */
  const [authExpired, setAuthExpired] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  /** When the stall window expires (no forward progress) we fail the index. */
  const stallDeadlineRef = useRef(0)
  /** Best progress seen so far, used to detect forward movement between polls. */
  const lastEmbeddedRef = useRef(-1)
  const lastChunkRef = useRef(-1)
  const mountedRef = useRef(true)

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      stopPolling()
      abortRef.current?.abort()
    }
  }, [stopPolling])

  const eps = target ? endpointsFor(target) : null

  // Poll index status until it leaves 'Indexing'.
  const startPolling = useCallback(() => {
    if (!target || !eps) return
    stopPolling()
    // Reset progress tracking; the stall window restarts from "now".
    stallDeadlineRef.current = Date.now() + POLL_STALL_MS
    lastEmbeddedRef.current = -1
    lastChunkRef.current = -1
    timerRef.current = setInterval(async () => {
      let res
      try {
        res = await eps.getStatus(target.id)
      } catch (err) {
        if (isAuthError(err)) {
          // Session expired and refresh failed — don't spin to a false
          // timeout. Stop and drop the user into the sign-in CTA.
          stopPolling()
          if (mountedRef.current) setAuthExpired(true)
          return
        }
        // Transient network blip — keep polling; the stall window guards
        // a genuinely stuck index.
        return
      }
      if (!mountedRef.current) return
      setIndexStatus(res.status)
      if (res.status !== 'Indexing') {
        stopPolling()
        return
      }
      // Forward progress resets the stall timer: embeddedCount climbed, or
      // chunking just completed (chunkCount 0 -> >0). A large book can index
      // for many minutes; only a genuinely stuck job trips the timeout.
      const advanced =
        res.embeddedCount > lastEmbeddedRef.current ||
        (lastChunkRef.current <= 0 && res.chunkCount > 0)
      if (advanced) {
        lastEmbeddedRef.current = res.embeddedCount
        lastChunkRef.current = res.chunkCount
        stallDeadlineRef.current = Date.now() + POLL_STALL_MS
      } else if (Date.now() > stallDeadlineRef.current) {
        stopPolling()
        setIndexStatus('Failed')
        setIndexError(t('reader.ask.indexTimeout'))
      }
    }, POLL_INTERVAL_MS)
  }, [target, eps, stopPolling, t])

  // Trigger indexing, then poll until Ready/Failed.
  const prepare = useCallback(async () => {
    if (!target || !eps) return
    setIndexError('')
    setIndexStatus('Indexing')
    try {
      const res = await eps.prepare(target.id)
      if (!mountedRef.current) return
      setIndexStatus(res.status)
      if (res.status === 'Indexing') startPolling()
      else if (res.status === 'Failed') setIndexError(t('reader.ask.indexFailed'))
    } catch {
      if (mountedRef.current) {
        setIndexStatus('Failed')
        setIndexError(t('reader.ask.indexFailed'))
      }
    }
  }, [target, eps, startPolling, t])

  // On open (authenticated): check status, prepare if needed, gate the composer.
  useEffect(() => {
    if (!visible || !isAuthenticated || !target || !eps) return
    let cancelled = false
    setIndexError('')
    setNotConfigured(false)
    setAuthExpired(false)
    ;(async () => {
      try {
        const res = await eps.getStatus(target.id)
        if (cancelled || !mountedRef.current) return
        setIndexStatus(res.status)
        if (res.status === 'NotIndexed' || res.status === 'Failed') {
          await prepare()
        } else if (res.status === 'Indexing') {
          startPolling()
        }
      } catch (err) {
        if (cancelled || !mountedRef.current) return
        // Expired session (refresh failed): show sign-in, not a fake failure.
        if (isAuthError(err)) {
          setAuthExpired(true)
          return
        }
        setIndexStatus('Failed')
        setIndexError(t('reader.ask.indexFailed'))
      }
    })()
    return () => {
      cancelled = true
      stopPolling()
    }
    // target.id / kind drive this; eps is derived from target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, isAuthenticated, target?.id, target?.kind])

  const ask = useCallback(async () => {
    const q = input.trim()
    if (!q || !target || !eps || loading || indexStatus !== 'Ready') return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    setError('')
    setNotConfigured(false)
    setInput('')
    try {
      const res = await eps.ask(target.id, q, undefined, ctrl.signal)
      if (ctrl.signal.aborted) return
      setHistory(prev => [
        ...prev,
        { question: q, answer: res.answer, citations: res.citations, insufficient: res.insufficient },
      ])
    } catch (err) {
      if (ctrl.signal.aborted || (err instanceof Error && err.name === 'AbortError')) return
      if (err instanceof ApiError && err.status === 503) setNotConfigured(true)
      else if (isAuthError(err)) setAuthExpired(true)
      else setError(t('reader.ask.error'))
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }, [input, target, eps, loading, indexStatus, t])

  const onCitationTap = (c: AskCitation) => {
    onCitation(c)
    onClose()
  }

  // A 401 after a failed refresh forces the sign-in CTA even though the
  // parent prop hasn't caught up to the expired session yet.
  const authed = isAuthenticated && !authExpired
  const indexing = indexStatus === 'Indexing'
  const indexFailed = indexStatus === 'Failed'
  const ready = indexStatus === 'Ready'

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={styles.pill} />
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
              {t('reader.ask.title')}
            </Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 16 }}>
            {history.length === 0 && !loading && ready && (
              <Text style={[styles.empty, { color: colors.textSecondary }]}>{t('reader.ask.empty')}</Text>
            )}
            {history.map((turn, i) => (
              <View key={i} style={styles.turn}>
                <Text style={[styles.question, { color: colors.text }]}>{turn.question}</Text>
                <Text style={[styles.answer, { color: colors.text }]}>{turn.answer}</Text>
                {turn.insufficient && (
                  <Text style={[styles.insufficient, { color: colors.textSecondary }]}>
                    {t('reader.ask.insufficient')}
                  </Text>
                )}
                {turn.citations.length > 0 && (
                  <View style={styles.citations}>
                    {turn.citations.map(c => (
                      <TouchableOpacity
                        key={c.chunkId}
                        onPress={() => onCitationTap(c)}
                        style={[styles.chip, { borderColor: colors.border }]}
                        accessibilityRole="button"
                      >
                        <Text style={[styles.chipText, { color: colors.text }]}>{`ch.${c.chapterOrd}`}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            ))}

            {authed && indexing && (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.primary} />
                <Text style={{ color: colors.textSecondary }}>{t('reader.ask.indexing')}</Text>
              </View>
            )}
            {authed && indexFailed && (
              <View style={styles.indexFail}>
                <Text style={{ color: colors.error, marginBottom: 8 }} accessibilityRole="alert">
                  {indexError || t('reader.ask.indexFailed')}
                </Text>
                <TouchableOpacity
                  onPress={prepare}
                  style={[styles.retry, { borderColor: colors.border }]}
                  accessibilityRole="button"
                >
                  <Text style={{ color: colors.text }}>{t('reader.ask.retry')}</Text>
                </TouchableOpacity>
              </View>
            )}

            {loading && (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.primary} />
                <Text style={{ color: colors.textSecondary }}>{t('reader.ask.thinking')}</Text>
              </View>
            )}
            {notConfigured ? (
              <Text style={{ color: colors.textSecondary, marginTop: 8 }} accessibilityRole="alert">
                {t('reader.ask.notConfigured')}
              </Text>
            ) : null}
            {error ? <Text style={{ color: colors.error, marginTop: 8 }} accessibilityRole="alert">{error}</Text> : null}
          </ScrollView>

          {authed ? (
            <View style={[styles.composer, { borderTopColor: colors.border }]}>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                value={input}
                onChangeText={setInput}
                placeholder={ready ? t('reader.ask.placeholder') : t('reader.ask.indexing')}
                placeholderTextColor={colors.textSecondary}
                editable={ready}
                multiline
                onSubmitEditing={ask}
              />
              <TouchableOpacity
                onPress={ask}
                disabled={loading || !ready || !input.trim()}
                style={[styles.send, { backgroundColor: colors.primary, opacity: loading || !ready || !input.trim() ? 0.5 : 1 }]}
                accessibilityRole="button"
              >
                <Text style={styles.sendText}>{t('reader.ask.send')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.composer, { borderTopColor: colors.border }]}>
              <Text style={{ color: colors.textSecondary, flex: 1 }}>{t('reader.ask.signIn')}</Text>
              <TouchableOpacity onPress={onSignIn} style={[styles.send, { backgroundColor: colors.primary }]} accessibilityRole="button">
                <Text style={styles.sendText}>{t('reader.ask.signInCta')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 24, maxHeight: '80%' },
  pill: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginTop: 12 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1,
  },
  title: { fontSize: 17, fontFamily: fonts.sansBold },
  body: { paddingHorizontal: 16, paddingTop: 12 },
  empty: { fontSize: 14, lineHeight: 20 },
  turn: { marginBottom: 16 },
  question: { fontSize: 14, fontFamily: fonts.sansBold, marginBottom: 4 },
  answer: { fontSize: 15, lineHeight: 22 },
  insufficient: { fontSize: 13, lineHeight: 18, fontStyle: 'italic', marginTop: 4 },
  citations: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  chipText: { fontSize: 12 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  indexFail: { marginTop: 8 },
  retry: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, borderTopWidth: 1,
  },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, maxHeight: 100, fontSize: 15 },
  send: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  sendText: { color: '#fff', fontFamily: fonts.sansBold, fontSize: 14 },
})
