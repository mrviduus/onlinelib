import { useState, useRef, useEffect, useCallback } from 'react'
import {
  View, Text, Modal, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, ScrollView, Alert, Switch,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import {
  ragApi, ApiError, composeQuotedQuestion, parseQuotedContent,
  type AskCitation, type AskTarget, type RagIndexStatus,
} from '@textstack/shared'
import {
  getBookChat, sendChatMessage, sendChatMessageJson,
  setSpoilerGate as setSpoilerGateApi, clearBookChat,
  type BookChatMessage,
} from '../lib/bookChat'
import { SseUnauthorizedError, SseUnsupportedError } from '../lib/sse'
import { AskMarkdown } from './AskMarkdown'
import { useTheme } from '../context/ThemeContext'
import { useLanguage } from '../context/LanguageContext'
import { fonts } from '../theme/typography'

interface AskTurn {
  question: string
  answer: string
  citations: AskCitation[]
  insufficient: boolean
  streaming: boolean
}

/** A passage attached to the composer via "Ask about this" (nonce forces re-attach on re-select). */
export interface AskPrefill {
  text: string
  nonce: number
}

interface AskSheetProps {
  visible: boolean
  /** What the panel asks against — catalog edition or user-uploaded book (AI-027 P2). */
  target?: AskTarget
  /** GUID of the chapter being read — threaded to the server for the spoiler gate + citation context. */
  currentChapterId?: string
  /** Passage handed in from the selection toolbar ("Ask about this") — attached as a quote card. */
  prefill?: AskPrefill | null
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

/** Suggested starter questions, shown only on an empty, Ready thread once history has loaded. */
const STARTER_KEYS = ['summary', 'characters', 'keyIdea', 'attention'] as const

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
    return { getStatus: ragApi.getUserIndexStatus, prepare: ragApi.prepareUserIndex }
  }
  return { getStatus: ragApi.getIndexStatus, prepare: ragApi.prepareIndex }
}

/**
 * Flattens the server's ordered message list into the Q&A turn shape the sheet renders. An assistant
 * message fills the preceding user turn's answer; a stray assistant becomes its own answer-only turn.
 */
function messagesToTurns(messages: BookChatMessage[]): AskTurn[] {
  const turns: AskTurn[] = []
  for (const m of messages) {
    if (m.role === 'user') {
      turns.push({ question: m.content, answer: '', citations: [], insufficient: false, streaming: false })
    } else {
      const last = turns[turns.length - 1]
      if (last && last.answer === '') {
        turns[turns.length - 1] = { ...last, answer: m.content, citations: m.citations ?? [] }
      } else {
        turns.push({ question: '', answer: m.content, citations: m.citations ?? [], insufficient: false, streaming: false })
      }
    }
  }
  return turns
}

export function AskSheet({
  visible, target, currentChapterId, prefill, isAuthenticated, onCitation, onSignIn, onClose,
}: AskSheetProps) {
  const { colors } = useTheme()
  const { t } = useLanguage()
  const [history, setHistory] = useState<AskTurn[]>([])
  const [input, setInput] = useState('')
  const [quote, setQuote] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Persistent conversation (NotebookLM model — one book = one chat).
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [spoilerGateEnabled, setSpoilerGateEnabled] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)

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
  const scrollRef = useRef<ScrollView>(null)
  /** Turn count at the last scroll, so streaming deltas (which grow the last turn's answer but not the
   *  count) scroll WITHOUT re-animating per token — only a new turn animates. */
  const prevTurnCountRef = useRef(0)

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
          stopPolling()
          if (mountedRef.current) setAuthExpired(true)
          return
        }
        return
      }
      if (!mountedRef.current) return
      setIndexStatus(res.status)
      if (res.status !== 'Indexing') {
        stopPolling()
        return
      }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, isAuthenticated, target?.id, target?.kind])

  // Load the persisted conversation when the sheet opens for a target (independent of the RAG index).
  // Keyed on kind:id so a book switch reloads; aborts the in-flight GET on close / switch.
  useEffect(() => {
    if (!visible || !isAuthenticated || !target) return
    const ctrl = new AbortController()
    setHistoryLoading(true)
    setError('')
    getBookChat(target, ctrl.signal)
      .then(conv => {
        if (ctrl.signal.aborted || !mountedRef.current) return
        setConversationId(conv.conversationId)
        setSpoilerGateEnabled(conv.spoilerGateEnabled)
        setHistory(messagesToTurns(conv.messages))
      })
      .catch(err => {
        if (ctrl.signal.aborted || !mountedRef.current) return
        if (isAuthError(err)) setAuthExpired(true)
        else setError(t('reader.ask.error'))
      })
      .finally(() => {
        if (!ctrl.signal.aborted && mountedRef.current) setHistoryLoading(false)
      })
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, isAuthenticated, target?.id, target?.kind])

  // Sheet closed mid-stream: abort the in-flight send. The optimistic user turn is intentionally
  // KEPT — reopening re-fires the load effect, which replaces local history with the server's copy.
  // The composer draft (attached quote + typed input) is transient and does NOT survive close/reopen:
  // the sheet stays mounted, so clear it here or a stale quote/draft would resurface on next open.
  useEffect(() => {
    if (visible) return
    abortRef.current?.abort()
    setLoading(false)
    setQuote(null)
    setInput('')
  }, [visible])

  // Attach a selected passage as a quote card when the reader hands one in.
  useEffect(() => {
    if (prefill) setQuote(prefill.text)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.nonce])

  // Auto-scroll to the newest turn. Animate only when the TURN COUNT changes; a long streamed answer
  // grows the last turn in place, so those updates scroll non-animated (no per-token re-animation).
  useEffect(() => {
    const animated = history.length !== prevTurnCountRef.current
    prevTurnCountRef.current = history.length
    scrollRef.current?.scrollToEnd({ animated })
  }, [history, loading, historyLoading])

  const appendDelta = useCallback((fragment: string) => {
    setHistory(prev => {
      if (prev.length === 0) return prev
      const next = prev.slice()
      const last = next[next.length - 1]
      next[next.length - 1] = { ...last, answer: last.answer + fragment }
      return next
    })
  }, [])

  const finishTurn = useCallback((patch: Partial<AskTurn>) => {
    setHistory(prev => {
      if (prev.length === 0) return prev
      const next = prev.slice()
      const last = next[next.length - 1]
      next[next.length - 1] = { ...last, ...patch, streaming: false }
      return next
    })
  }, [])

  /** Drops the optimistic user turn appended at send time — used on a hard failure so a dead
   *  question-with-blank-answer doesn't linger next to the error banner (history reverts). */
  const removeLastTurn = useCallback(() => {
    setHistory(prev => prev.slice(0, -1))
  }, [])

  const ask = useCallback(async (rawQuestion: string) => {
    const q = rawQuestion.trim()
    if (!q || !target || !conversationId || loading || indexStatus !== 'Ready') return

    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    setError('')
    setNotConfigured(false)

    setHistory(prev => [
      ...prev,
      { question: q, answer: '', citations: [], insufficient: false, streaming: true },
    ])

    try {
      await sendChatMessage(conversationId, q, currentChapterId, {
        onDelta: appendDelta,
        onDone: done => {
          if (ctrl.signal.aborted) return
          finishTurn({ citations: done.citations, insufficient: done.insufficient })
        },
        onError: msg => {
          if (ctrl.signal.aborted) return
          finishTurn({})
          setError(msg)
        },
        signal: ctrl.signal,
      })
      if (!ctrl.signal.aborted) finishTurn({})
    } catch (err) {
      if (ctrl.signal.aborted || (err instanceof Error && err.name === 'AbortError')) return
      if (err instanceof SseUnsupportedError) {
        // No streaming support → one-shot JSON request against the same endpoint.
        try {
          const res = await sendChatMessageJson(conversationId, q, currentChapterId, ctrl.signal)
          if (ctrl.signal.aborted) return
          finishTurn({ answer: res.answer, citations: res.citations, insufficient: res.insufficient })
        } catch (fallbackErr) {
          if (ctrl.signal.aborted) return
          if (fallbackErr instanceof ApiError && fallbackErr.status === 503) {
            finishTurn({})
            setNotConfigured(true)
          } else if (isAuthError(fallbackErr)) {
            finishTurn({})
            setAuthExpired(true)
          } else {
            // Hard failure: streaming unsupported AND the JSON fallback failed. Revert the optimistic
            // turn so there's no ghost question with a blank answer beside the error banner.
            removeLastTurn()
            setError(t('reader.ask.error'))
          }
        }
      } else if (err instanceof SseUnauthorizedError || isAuthError(err)) {
        finishTurn({})
        setAuthExpired(true)
      } else {
        // Hard failure: a non-401 error that wasn't a streaming-unsupported signal, so no JSON
        // fallback applies. Revert the optimistic turn alongside the error banner.
        removeLastTurn()
        setError(t('reader.ask.error'))
      }
    } finally {
      if (abortRef.current === ctrl && mountedRef.current) setLoading(false)
    }
  }, [target, conversationId, currentChapterId, loading, indexStatus, appendDelta, finishTurn, removeLastTurn, t])

  const submit = useCallback(() => {
    const q = input.trim()
    if ((!q && !quote) || loading || indexStatus !== 'Ready') return
    ask(quote ? composeQuotedQuestion(quote, q) : q)
    setInput('')
    setQuote(null)
  }, [input, quote, loading, indexStatus, ask])

  const setSpoilerGate = useCallback((next: boolean) => {
    if (!conversationId) return
    const prev = spoilerGateEnabled
    setSpoilerGateEnabled(next) // optimistic
    setSpoilerGateApi(conversationId, next).catch(() => {
      if (mountedRef.current) setSpoilerGateEnabled(prev)
    })
  }, [conversationId, spoilerGateEnabled])

  const handleClear = useCallback(() => {
    if (!conversationId || loading) return
    Alert.alert(t('reader.ask.clearChat'), t('reader.ask.clearConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('reader.ask.clearChat'),
        style: 'destructive',
        onPress: () => {
          const prev = history
          setHistory([]) // optimistic
          clearBookChat(conversationId).catch(() => {
            if (mountedRef.current) setHistory(prev)
          })
        },
      },
    ])
  }, [conversationId, loading, history, t])

  const onCitationTap = (c: AskCitation) => {
    onCitation(c)
    onClose()
  }

  // A 401 after a failed refresh forces the sign-in CTA even though the parent hasn't caught up.
  const authed = isAuthenticated && !authExpired
  const indexing = indexStatus === 'Indexing'
  const indexFailed = indexStatus === 'Failed'
  const ready = indexStatus === 'Ready'
  // Subtle for user uploads (no spoiler concern on your own document, but offered for consistency).
  const spoilerSubtle = target?.kind === 'userbook'
  // Starters call `ask()` directly, bypassing the quote-compose path in `submit()`. Rather than
  // re-plumb them, hide them while a quote is attached so a tap can never silently drop the quote.
  const showStarters =
    authed && ready && history.length === 0 && !historyLoading && !loading && !quote

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={[styles.pill, { backgroundColor: colors.border }]} />
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
              {t('reader.ask.title')}
            </Text>
            <View style={styles.headerActions}>
              {authed && (
                <View style={[styles.spoiler, spoilerSubtle && styles.spoilerSubtle]}>
                  <Text style={[styles.spoilerLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                    {t('reader.ask.spoilerToggle')}
                  </Text>
                  <Switch
                    value={spoilerGateEnabled}
                    onValueChange={setSpoilerGate}
                    trackColor={{ true: colors.primary }}
                    accessibilityLabel={t('reader.ask.spoilerToggle')}
                  />
                </View>
              )}
              {authed && history.length > 0 && (
                <TouchableOpacity
                  onPress={handleClear}
                  style={styles.iconBtn}
                  accessibilityRole="button"
                  accessibilityLabel={t('reader.ask.clearChat')}
                >
                  <Ionicons name="trash-outline" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onClose} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView ref={scrollRef} style={styles.body} contentContainerStyle={{ paddingBottom: 16 }}>
            {historyLoading ? (
              <View style={styles.skeleton} accessibilityLabel={t('reader.ask.loadingHistory')}>
                <View style={[styles.skelLine, { backgroundColor: colors.border, width: '70%' }]} />
                <View style={[styles.skelLine, { backgroundColor: colors.border, width: '90%' }]} />
                <View style={[styles.skelLine, { backgroundColor: colors.border, width: '55%' }]} />
              </View>
            ) : (
              <>
                {history.length === 0 && !loading && ready && (
                  <Text style={[styles.empty, { color: colors.textSecondary }]}>{t('reader.ask.empty')}</Text>
                )}
                {showStarters && (
                  <View style={styles.starters}>
                    <Text style={[styles.startersTitle, { color: colors.textSecondary }]}>{t('reader.ask.startersTitle')}</Text>
                    {STARTER_KEYS.map(key => (
                      <TouchableOpacity
                        key={key}
                        onPress={() => ask(t(`reader.ask.starters.${key}`))}
                        style={[styles.starter, { borderColor: colors.border }]}
                        accessibilityRole="button"
                      >
                        <Text style={[styles.starterText, { color: colors.text }]}>{t(`reader.ask.starters.${key}`)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                {history.map((turn, i) => {
                  const parsed = parseQuotedContent(turn.question)
                  return (
                    <View key={i} style={styles.turn}>
                      {parsed.quote != null && (
                        <View style={[styles.quoteCard, { borderLeftColor: colors.primary, backgroundColor: colors.surface }]}>
                          <Text style={[styles.quoteText, { color: colors.textSecondary }]}>{parsed.quote}</Text>
                        </View>
                      )}
                      {parsed.text !== '' && (
                        <Text style={[styles.question, { color: colors.text }]}>{parsed.text}</Text>
                      )}
                      {turn.answer !== '' && <AskMarkdown text={turn.answer} />}
                      {turn.streaming && turn.answer === '' && (
                        <View style={styles.loading}>
                          <ActivityIndicator color={colors.primary} />
                          <Text style={{ color: colors.textSecondary }}>{t('reader.ask.thinking')}</Text>
                        </View>
                      )}
                      {turn.insufficient && (
                        <Text style={[styles.insufficient, { color: colors.textSecondary }]}>
                          {t('reader.ask.insufficient')}
                        </Text>
                      )}
                      {!turn.streaming && turn.citations.length > 0 && (
                        <View style={styles.citations}>
                          {turn.citations.map(c => (
                            <TouchableOpacity
                              key={c.chunkId}
                              onPress={() => onCitationTap(c)}
                              style={[styles.chip, { borderColor: colors.border }]}
                              accessibilityRole="button"
                            >
                              <Text style={[styles.chipText, { color: colors.text }]}>
                                {c.sourcePage != null ? `p.${c.sourcePage}` : `ch.${c.chapterOrd}`}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                  )
                })}

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
                    <TouchableOpacity onPress={prepare} style={[styles.retry, { borderColor: colors.border }]} accessibilityRole="button">
                      <Text style={{ color: colors.text }}>{t('reader.ask.retry')}</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {notConfigured ? (
                  <Text style={{ color: colors.textSecondary, marginTop: 8 }} accessibilityRole="alert">
                    {t('reader.ask.notConfigured')}
                  </Text>
                ) : null}
                {error ? <Text style={{ color: colors.error, marginTop: 8 }} accessibilityRole="alert">{error}</Text> : null}
              </>
            )}
          </ScrollView>

          {authed ? (
            <View style={[styles.composer, { borderTopColor: colors.border }]}>
              {quote != null && (
                <View style={[styles.quoteCard, styles.composerQuote, { borderLeftColor: colors.primary, backgroundColor: colors.surface }]}>
                  <Text style={[styles.quoteText, { color: colors.textSecondary }]} numberOfLines={3}>{quote}</Text>
                  <TouchableOpacity onPress={() => setQuote(null)} accessibilityRole="button" accessibilityLabel={t('reader.ask.detachQuote')}>
                    <Ionicons name="close" size={16} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              )}
              <View style={styles.composerRow}>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                  value={input}
                  onChangeText={setInput}
                  placeholder={ready ? t('reader.ask.placeholder') : t('reader.ask.indexing')}
                  placeholderTextColor={colors.textSecondary}
                  editable={ready}
                  multiline
                  onSubmitEditing={submit}
                />
                <TouchableOpacity
                  onPress={submit}
                  disabled={loading || !ready || (!input.trim() && !quote)}
                  style={[styles.send, { backgroundColor: colors.primary, opacity: loading || !ready || (!input.trim() && !quote) ? 0.5 : 1 }]}
                  accessibilityRole="button"
                >
                  <Text style={styles.sendText}>{t('reader.ask.send')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={[styles.composer, styles.composerRow, { borderTopColor: colors.border }]}>
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
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 24, maxHeight: '85%' },
  pill: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1,
  },
  title: { fontSize: 17, fontFamily: fonts.sansBold, flexShrink: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  spoiler: { flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 4 },
  spoilerSubtle: { opacity: 0.6 },
  spoilerLabel: { fontSize: 12, maxWidth: 90 },
  iconBtn: { padding: 4 },
  body: { paddingHorizontal: 16, paddingTop: 12 },
  empty: { fontSize: 14, lineHeight: 20 },
  skeleton: { gap: 10, paddingTop: 4 },
  skelLine: { height: 12, borderRadius: 6, opacity: 0.5 },
  starters: { gap: 8, marginBottom: 16 },
  startersTitle: { fontSize: 12, fontFamily: fonts.sansMedium, textTransform: 'uppercase', letterSpacing: 0.5 },
  starter: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  starterText: { fontSize: 14 },
  turn: { marginBottom: 16 },
  question: { fontSize: 14, fontFamily: fonts.sansBold, marginBottom: 6 },
  quoteCard: { borderLeftWidth: 3, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 6 },
  quoteText: { fontSize: 13, lineHeight: 19, fontStyle: 'italic' },
  insufficient: { fontSize: 13, lineHeight: 18, fontStyle: 'italic', marginTop: 4 },
  citations: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  chipText: { fontSize: 12 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  indexFail: { marginTop: 8 },
  retry: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  composer: { padding: 12, borderTopWidth: 1, gap: 8 },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  composerQuote: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 0 },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, maxHeight: 100, fontSize: 15 },
  send: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  sendText: { color: '#fff', fontFamily: fonts.sansBold, fontSize: 14 },
})
