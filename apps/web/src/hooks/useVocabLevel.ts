import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { getVocabStats } from '../api/vocabulary'

const CACHE_KEY = 'vocab.level'
const THRESHOLDS = [0, 1, 10, 50, 200, 500] as const

export interface VocabLevel {
  level: number
  label: string
  masteredCount: number
  nextThreshold: number | null
}

export function getVocabLevel(masteredCount: number): VocabLevel {
  let level = 0
  for (let i = THRESHOLDS.length - 1; i >= 0; i--) {
    if (masteredCount >= THRESHOLDS[i]) {
      level = i
      break
    }
  }
  const nextThreshold = level < THRESHOLDS.length - 1 ? THRESHOLDS[level + 1] : null
  return { level, label: `Lv.${level}`, masteredCount, nextThreshold }
}

function getCached(): VocabLevel | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return null
}

export function useVocabLevel(): VocabLevel | null {
  const { isAuthenticated } = useAuth()
  const [data, setData] = useState<VocabLevel | null>(getCached)

  useEffect(() => {
    if (!isAuthenticated) return

    getVocabStats()
      .then((s) => {
        const vl = getVocabLevel(s.byStage.mastered)
        setData(vl)
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(vl)) } catch {}
      })
      .catch(() => {})
  }, [isAuthenticated])

  return data
}
