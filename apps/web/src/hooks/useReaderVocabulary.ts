import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useGuestLimits, type GuestWord } from '../context/GuestLimitsContext'
import { getReaderVocab, markAsKnown as markAsKnownApi, saveWord, deleteWord as deleteWordApi, type SaveWordRequest } from '../api/vocabulary'

export type VocabMap = Map<string, { stage: number; id?: string; translation?: string }>

export function useReaderVocabulary() {
  const { isAuthenticated } = useAuth()
  const { guestState, addGuestWord, isWordLimitReached } = useGuestLimits()
  const [vocabMap, setVocabMap] = useState<VocabMap>(new Map())
  const [loading, setLoading] = useState(false)
  const [wordLimitHit, setWordLimitHit] = useState(false)
  const mapRef = useRef<VocabMap>(new Map())

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
