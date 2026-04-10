import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useGuestLimits, type GuestWord } from '../context/GuestLimitsContext'
import { getReaderVocab, markAsKnown as markAsKnownApi, saveWord, deleteWord as deleteWordApi, updateWord, type SaveWordRequest } from '../api/vocabulary'
import { translate as translateWord } from '../api/translation'

export type VocabMap = Map<string, { stage: number; id?: string; translation?: string }>

export function useReaderVocabulary(bookLanguage?: string, targetLang?: string | null) {
  const { isAuthenticated } = useAuth()
  const { guestState, addGuestWord, isWordLimitReached } = useGuestLimits()
  const [vocabMap, setVocabMap] = useState<VocabMap>(new Map())
  const [loading, setLoading] = useState(false)
  const [wordLimitHit, setWordLimitHit] = useState(false)
  const mapRef = useRef<VocabMap>(new Map())
  const backfillDone = useRef(false)

  const commitMap = useCallback((map: VocabMap) => {
    mapRef.current = map
    setVocabMap(map)
  }, [])

  const updateMap = useCallback((fn: (draft: VocabMap) => void) => {
    const next = new Map(mapRef.current)
    fn(next)
    commitMap(next)
  }, [commitMap])

  // Load vocab: API for auth users, localStorage for guests
  useEffect(() => {
    if (isAuthenticated) {
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
    } else {
      // Guest: build vocab map from localStorage
      const m: VocabMap = new Map()
      for (const w of guestState.savedWords) {
        m.set(w.word.toLowerCase(), { stage: 0, translation: w.translation || undefined })
      }
      commitMap(m)
    }
  }, [isAuthenticated, guestState.savedWords, commitMap])

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
    if (isAuthenticated) {
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
    } else {
      // Guest: save to localStorage via context
      const gw: GuestWord = {
        word: req.word,
        translation: null,
        language: req.language || 'en',
        bookSlug: '',
        savedAt: new Date().toISOString(),
      }
      const ok = addGuestWord(gw)
      if (!ok) {
        setWordLimitHit(true)
        return null
      }
      updateMap(m => m.set(req.word.toLowerCase(), { stage: 0, translation: undefined }))
      return { id: '', word: req.word, stage: 0, translation: null }
    }
  }, [isAuthenticated, updateMap, addGuestWord])

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

  const clearWordLimitHit = useCallback(() => setWordLimitHit(false), [])

  return { vocabMap, loading, addWord, markAsKnown, removeWord, updateTranslation, refreshMarks, wordLimitHit, clearWordLimitHit, isWordLimitReached }
}
