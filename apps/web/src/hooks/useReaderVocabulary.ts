import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { getReaderVocab, markAsKnown as markAsKnownApi, saveWord, deleteWord as deleteWordApi, updateWord, type SaveWordRequest } from '../api/vocabulary'
import { translate as translateWord } from '../api/translation'

export type VocabMap = Map<string, { stage: number; id?: string; translation?: string }>

export function useReaderVocabulary(bookLanguage?: string, targetLang?: string | null) {
  const { isAuthenticated, waitForSession, ensureSession } = useAuth()
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
          m.set(w.word.toLowerCase(), { stage: w.stage, id: w.id, translation: w.translation })
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

  const addWord = useCallback(async (req: SaveWordRequest) => {
    // Gate: block first tap until AuthContext has finished bootstrapping (B2).
    await waitForSession()
    // I2/I4: bootstrap теперь read-only. Первый tap слова — demand-driven триггер
    // для создания guest-сессии. Single-flight внутри ensureSession дедуплицирует
    // конкурентные tap'ы в один /auth/guest.
    if (!isAuthRef.current) await ensureSession()
    // Network failed → local-only mode, silent no-op (B3).
    if (!isAuthRef.current) return null
    const saved = await saveWord(req)
    const key = saved.word.toLowerCase()
    const existing = mapRef.current.get(key)
    if (existing && existing.id === saved.id && existing.stage === saved.stage) {
      return saved
    }
    updateMap(m => m.set(key, {
      stage: saved.stage, id: saved.id,
      translation: existing?.translation || saved.translation || undefined,
    }))
    return saved
  }, [waitForSession, ensureSession, updateMap])

  const markAsKnown = useCallback(async (id: string, word: string) => {
    if (!isAuthenticated) return null
    const updated = await markAsKnownApi(id)
    updateMap(m => m.set(word.toLowerCase(), { stage: 4, id: updated.id }))
    return updated
  }, [isAuthenticated, updateMap])

  const removeWord = useCallback(async (id: string, word: string) => {
    if (isAuthenticated) {
      await deleteWordApi(id)
    }
    updateMap(m => m.delete(word.toLowerCase()))
  }, [isAuthenticated, updateMap])

  const updateTranslation = useCallback((word: string, translation: string) => {
    const key = word.toLowerCase()
    const entry = mapRef.current.get(key)
    if (!entry) return
    updateMap(m => m.set(key, { ...entry, translation }))
  }, [updateMap])

  const refreshMarks = useCallback(() => {
    setVocabMap(new Map(mapRef.current))
  }, [])

  return { vocabMap, loading, addWord, markAsKnown, removeWord, updateTranslation, refreshMarks }
}
