import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { getAllMoods, getMoodsForEdition, setMoodsForEdition, type MoodDto } from '../api/moods'

interface MoodSelectorProps {
  editionId: string
}

export function MoodSelector({ editionId }: MoodSelectorProps) {
  const { isAuthenticated } = useAuth()
  const [moods, setMoods] = useState<MoodDto[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    getAllMoods().then(setMoods).catch(() => {})
  }, [])

  useEffect(() => {
    if (!isAuthenticated || !editionId) return
    getMoodsForEdition(editionId)
      .then((ids) => { setSelected(new Set(ids)); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [isAuthenticated, editionId])

  if (!isAuthenticated || moods.length === 0) return null

  const toggle = async (moodId: string) => {
    if (saving) return
    const next = new Set(selected)
    if (next.has(moodId)) {
      next.delete(moodId)
    } else {
      if (next.size >= 5) return
      next.add(moodId)
    }
    setSelected(next)
    setSaving(true)
    try {
      await setMoodsForEdition(editionId, Array.from(next))
    } catch {
      setSelected(selected) // revert
    }
    setSaving(false)
  }

  if (!loaded) return null

  return (
    <div className="mood-selector">
      <span className="mood-selector__label">How did it feel?</span>
      <div className="mood-selector__chips">
        {moods.map((mood) => (
          <button
            key={mood.id}
            type="button"
            className={`mood-selector__chip ${selected.has(mood.id) ? 'mood-selector__chip--active' : ''}`}
            onClick={() => toggle(mood.id)}
            disabled={saving || (!selected.has(mood.id) && selected.size >= 5)}
          >
            {mood.emoji && <span className="mood-selector__emoji">{mood.emoji}</span>}
            {mood.name}
          </button>
        ))}
      </div>
    </div>
  )
}
