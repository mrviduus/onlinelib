import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { getReaderVocab, markAsKnown as markAsKnownApi, saveWord, deleteWord as deleteWordApi, type SaveWordRequest } from '../api/vocabulary'

export type VocabMap = Map<string, { stage: number; id?: string; translation?: string }>

export function useReaderVocabulary() {
  const { isAuthenticated } = useAuth()
  const [vocabMap, setVocabMap] = useState<VocabMap>(new Map())
  const [loading, setLoading] = useState(false)
  const mapRef = useRef<VocabMap>(new Map())

  useEffect(() => {
    if (!isAuthenticated) return
    let cancelled = false
    setLoading(true)
    getReaderVocab()
      .then((words) => {
        if (cancelled) return
        const m = new Map<string, { stage: number; id?: string; translation?: string }>()
        for (const w of words) {
          m.set(w.word.toLowerCase(), { stage: w.stage, id: w.id, translation: w.translation })
        }
        mapRef.current = m
        setVocabMap(m)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [isAuthenticated])

  const addWord = useCallback(async (req: SaveWordRequest) => {
    const saved = await saveWord(req)
    const key = saved.word.toLowerCase()
    const existing = mapRef.current.get(key)
    // Skip map update if word already exists with same stage (avoids VocabWordLayer re-mark)
    if (existing && existing.id === saved.id && existing.stage === saved.stage) {
      return saved
    }
    const next = new Map(mapRef.current)
    next.set(key, { stage: saved.stage, id: saved.id })
    mapRef.current = next
    setVocabMap(next)
    return saved
  }, [])

  const markAsKnown = useCallback(async (id: string, word: string) => {
    const updated = await markAsKnownApi(id)
    const key = word.toLowerCase()
    const next = new Map(mapRef.current)
    next.set(key, { stage: 4, id: updated.id })
    mapRef.current = next
    setVocabMap(next)
    return updated
  }, [])

  const removeWord = useCallback(async (id: string, word: string) => {
    await deleteWordApi(id)
    const key = word.toLowerCase()
    const next = new Map(mapRef.current)
    next.delete(key)
    mapRef.current = next
    setVocabMap(next)
  }, [])

  return { vocabMap, loading, addWord, markAsKnown, removeWord }
}
