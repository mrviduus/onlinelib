import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useGuestLimits } from '../context/GuestLimitsContext'
import { getReaderVocab, markAsKnown as markAsKnownApi, saveWord, deleteWord as deleteWordApi, updateWord, type SaveWordRequest, type VocabWordDto } from '../api/vocabulary'
import { translate as translateWord } from '../api/translation'
import {
  addPendingVocabWord,
  listPendingVocabWords,
  countPendingVocabWords,
  deletePendingVocabWord,
  type PendingVocabWord,
} from '../lib/offlineDb'
import { normalizeVocabKey } from '../lib/vocabKey'

export type VocabMap = Map<string, { stage: number; id?: string; translation?: string; isPending?: boolean }>

export function useReaderVocabulary(bookLanguage?: string, targetLang?: string | null) {
  const { isAuthenticated, waitForSession, ensureSession } = useAuth()
  const { commitmentThreshold } = useGuestLimits()
  const [vocabMap, setVocabMap] = useState<VocabMap>(new Map())
  const [loading, setLoading] = useState(false)
  const mapRef = useRef<VocabMap>(new Map())
  const backfillDone = useRef(false)
  // Keep auth state available inside async callbacks without stale-closure races.
  const isAuthRef = useRef(isAuthenticated)
  isAuthRef.current = isAuthenticated

  const commitMap = useCallback((map: VocabMap) => {
    mapRef.current = map
    setVocabMap(map)
  }, [])

  const updateMap = useCallback((fn: (draft: VocabMap) => void) => {
    const next = new Map(mapRef.current)
    fn(next)
    commitMap(next)
  }, [commitMap])

  // Load vocab from API once a session exists (guest or real).
  useEffect(() => {
    if (!isAuthenticated) {
      commitMap(new Map())
      return
    }
    let cancelled = false
    setLoading(true)
    getReaderVocab()
      .then((words) => {
        if (cancelled) return
        const m: VocabMap = new Map()
        for (const w of words) {
          m.set(normalizeVocabKey(w.word), { stage: w.stage, id: w.id, translation: w.translation })
        }
        commitMap(m)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [isAuthenticated, commitMap])

  // Backfill translations for words missing them
  useEffect(() => {
    if (!targetLang || !bookLanguage || backfillDone.current) return
    if (vocabMap.size === 0 || loading) return

    const missing: { word: string; id?: string }[] = []
    for (const [key, entry] of vocabMap) {
      // Skip pending entries — their `id` is a local UUID, not a backend row.
      if (entry.isPending) continue
      if (!entry.translation) missing.push({ word: key, id: entry.id })
    }
    if (missing.length === 0) return

    backfillDone.current = true
    const lang = bookLanguage
    const target = targetLang

    // Translate in small batches to avoid overwhelming the API
    ;(async () => {
      for (let i = 0; i < missing.length; i++) {
        const { word, id } = missing[i]
        try {
          const res = await translateWord(word, lang, target)
          const translation = res.translatedText
          if (!translation) continue
          updateMap(m => {
            const entry = m.get(word)
            if (entry) m.set(word, { ...entry, translation })
          })
          if (id) updateWord(id, { translation }).catch(() => {})
        } catch { /* skip */ }
      }
    })()
  }, [vocabMap, loading, targetLang, bookLanguage, updateMap])

  // I4: flush pending local vocab into backend. Called:
  //   (a) on threshold-crossing after ensureSession succeeds;
  //   (b) pre-save in Path A when session was acquired externally (I5 stale-pending guard).
  // Stops on first failure — remaining pending stay in IndexedDB for next retry.
  const flushPendingIfAny = useCallback(async () => {
    let pending: PendingVocabWord[]
    try {
      pending = await listPendingVocabWords()
    } catch {
      return
    }
    if (pending.length === 0) return

    for (const p of pending) {
      const key = normalizeVocabKey(p.word)
      const existing = mapRef.current.get(key)
      try {
        const saved = await saveWord({
          word: p.word,
          language: p.language,
          // Prefer translation captured locally after pending was created (via updateTranslation).
          translation: existing?.translation ?? p.translation ?? null,
          definition: p.definition ?? null,
          editionId: p.editionId ?? null,
          chapterId: p.chapterId ?? null,
          userBookId: p.userBookId ?? null,
          sentence: p.sentence ?? null,
          bookTitle: p.bookTitle ?? null,
          nativeLanguage: p.nativeLanguage ?? null,
        })
        await deletePendingVocabWord(p.id).catch(() => {})
        updateMap(m => {
          // Preserve any translation accumulated in map (from translateApi) over backend's null.
          const preserved = m.get(key)?.translation ?? saved.translation ?? p.translation ?? undefined
          m.set(normalizeVocabKey(saved.word), {
            stage: saved.stage,
            id: saved.id,
            translation: preserved ?? undefined,
          })
        })
      } catch {
        // I4: keep in local, retry on next trigger. Stop iteration to avoid hammering a failing API.
        break
      }
    }
  }, [updateMap])

  const addWord = useCallback(async (req: SaveWordRequest): Promise<VocabWordDto | null> => {
    // Gate: block first tap until AuthContext has finished bootstrapping (B2).
    await waitForSession()

    // Path A: session exists (guest or real) → direct save, plus any stale pending flush.
    if (isAuthRef.current) {
      // I5: pending из pre-auth периода (напр. юзер сохранил 1-2 слова как anon,
      // потом залогинился на другой странице) — flush перед текущим save.
      await flushPendingIfAny()
      const saved = await saveWord(req)
      const key = normalizeVocabKey(saved.word)
      const existing = mapRef.current.get(key)
      if (existing && existing.id === saved.id && existing.stage === saved.stage && !existing.isPending) {
        return saved
      }
      updateMap(m => m.set(key, {
        stage: saved.stage, id: saved.id,
        translation: existing?.translation || saved.translation || undefined,
      }))
      return saved
    }

    // Path B: anonymous → accumulate locally until commitment threshold.
    const pending: PendingVocabWord = {
      id: crypto.randomUUID(),
      word: req.word,
      language: req.language,
      translation: req.translation ?? null,
      definition: req.definition ?? null,
      editionId: req.editionId ?? null,
      chapterId: req.chapterId ?? null,
      userBookId: req.userBookId ?? null,
      sentence: req.sentence ?? null,
      bookTitle: req.bookTitle ?? null,
      nativeLanguage: req.nativeLanguage ?? null,
      createdAt: Date.now(),
    }
    try {
      await addPendingVocabWord(pending)
    } catch {
      // I7: IndexedDB unavailable (Safari private / storage full). Silent no-op.
      return null
    }
    // I8: synthetic map entry so WordPopup can show "saved" state immediately.
    // `isPending` flag prevents backfill from hitting backend with a local UUID.
    updateMap(m => m.set(normalizeVocabKey(req.word), {
      stage: 0,
      id: pending.id,                // local UUID; replaced with backend id after flush
      translation: req.translation ?? undefined,
      isPending: true,
    }))

    // I2: threshold check — cross → create guest, flush everything.
    let count = 0
    try {
      count = await countPendingVocabWords()
    } catch {
      count = 0
    }
    if (count >= commitmentThreshold) {
      await ensureSession()
      if (isAuthRef.current) {
        await flushPendingIfAny()
      }
      // I7: ensureSession fail → pending остаётся, следующий tap снова триггерит.
    }

    // Path B returns null — caller (ReaderHighlights) tolerates null result.
    return null
  }, [waitForSession, ensureSession, updateMap, commitmentThreshold, flushPendingIfAny])

  const markAsKnown = useCallback(async (id: string, word: string) => {
    if (!isAuthenticated) return null
    const updated = await markAsKnownApi(id)
    updateMap(m => m.set(normalizeVocabKey(word), { stage: 4, id: updated.id }))
    return updated
  }, [isAuthenticated, updateMap])

  const removeWord = useCallback(async (id: string, word: string) => {
    if (isAuthenticated) {
      await deleteWordApi(id)
    }
    updateMap(m => m.delete(normalizeVocabKey(word)))
  }, [isAuthenticated, updateMap])

  const updateTranslation = useCallback((word: string, translation: string) => {
    const key = normalizeVocabKey(word)
    const entry = mapRef.current.get(key)
    if (!entry) return
    updateMap(m => m.set(key, { ...entry, translation }))
  }, [updateMap])

  const refreshMarks = useCallback(() => {
    setVocabMap(new Map(mapRef.current))
  }, [])

  return { vocabMap, loading, addWord, markAsKnown, removeWord, updateTranslation, refreshMarks }
}
