import { useState, useEffect, useRef, useCallback } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { moodsApi } from '@textstack/shared'
import type { MoodDto } from '@textstack/shared/api/moods'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useToast } from '../context/ToastContext'
import { fonts } from '../theme/typography'

interface MoodSelectorProps {
  editionId?: string
  userBookId?: string
}

export function MoodSelector({ editionId, userBookId }: MoodSelectorProps) {
  const { isAuthenticated } = useAuth()
  const { colors } = useTheme()
  const toast = useToast()
  const [moods, setMoods] = useState<MoodDto[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const mountedRef = useRef(true)

  const bookId = userBookId || editionId
  const isUserBook = !!userBookId

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Cancellation flag prevents stale mood-list responses from a previous
  // language overwriting the current list during fast theme/lang switches.
  useEffect(() => {
    let cancelled = false
    moodsApi.getAllMoods()
      .then(m => { if (!cancelled) setMoods(m) })
      .catch(e => { if (!cancelled) console.warn('Moods load failed:', e) })
    return () => { cancelled = true }
  }, [])

  // Per-book moods. Cancellation handles fast book switching that previously
  // could leave the wrong book's mood selection visible.
  useEffect(() => {
    if (!isAuthenticated || !bookId) return
    let cancelled = false
    setLoaded(false)
    const fetchMoods = isUserBook
      ? moodsApi.getMoodsForUserBook(bookId)
      : moodsApi.getMoodsForEdition(bookId)
    fetchMoods
      .then(ids => {
        if (cancelled) return
        setSelected(new Set(ids))
        setLoaded(true)
      })
      .catch(e => {
        if (cancelled) return
        console.warn('Book moods load failed:', e)
        setLoaded(true)
      })
    return () => { cancelled = true }
  }, [isAuthenticated, bookId, isUserBook])

  const toggle = useCallback(async (moodId: string) => {
    if (saving || !bookId) return
    // Snapshot for rollback. The previous implementation rolled back via
    // `setSelected(selected)` which works only because of the saving guard
    // (no concurrent mutations possible) — making it explicit avoids future
    // foot-guns if the guard ever moves.
    const snapshot = new Set(selected)
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
      const setMoodsFn = isUserBook ? moodsApi.setMoodsForUserBook : moodsApi.setMoodsForEdition
      await setMoodsFn(bookId, Array.from(next))
    } catch (e) {
      console.warn('Save moods failed:', e)
      if (mountedRef.current) {
        setSelected(snapshot)
        toast.show({ message: 'Could not save mood', variant: 'error' })
      }
    } finally {
      if (mountedRef.current) setSaving(false)
    }
  }, [saving, bookId, selected, isUserBook, toast])

  if (!isAuthenticated || moods.length === 0 || !loaded) return null

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>How did it feel?</Text>
      <View style={styles.chips}>
        {moods.map(mood => {
          const isActive = selected.has(mood.id)
          const disabled = saving || (!isActive && selected.size >= 5)
          return (
            <TouchableOpacity
              key={mood.id}
              style={[
                styles.chip,
                { borderColor: isActive ? colors.primary : colors.border },
                isActive && { backgroundColor: colors.primaryLight },
                disabled && !isActive && { opacity: 0.4 },
              ]}
              onPress={() => toggle(mood.id)}
              disabled={disabled}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Mood: ${mood.name}`}
              accessibilityState={{ selected: isActive, disabled }}
            >
              {mood.emoji && <Text style={styles.emoji}>{mood.emoji}</Text>}
              <Text style={[styles.chipText, { color: isActive ? colors.primary : colors.text }]}>
                {mood.name}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { marginTop: 12 },
  label: { fontFamily: fonts.sans, fontSize: 13, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  emoji: { fontSize: 16 },
  chipText: { fontFamily: fonts.sansMedium, fontSize: 13 },
})
