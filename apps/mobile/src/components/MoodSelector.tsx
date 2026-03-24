import { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { moodsApi } from '@textstack/shared'
import type { MoodDto } from '@textstack/shared/api/moods'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { fonts } from '../theme/typography'

interface MoodSelectorProps {
  editionId?: string
  userBookId?: string
}

export function MoodSelector({ editionId, userBookId }: MoodSelectorProps) {
  const { isAuthenticated } = useAuth()
  const { colors } = useTheme()
  const [moods, setMoods] = useState<MoodDto[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const bookId = userBookId || editionId
  const isUserBook = !!userBookId

  useEffect(() => {
    moodsApi.getAllMoods().then(setMoods).catch(() => {})
  }, [])

  useEffect(() => {
    if (!isAuthenticated || !bookId) return
    const fetchMoods = isUserBook
      ? moodsApi.getMoodsForUserBook(bookId)
      : moodsApi.getMoodsForEdition(bookId)
    fetchMoods
      .then((ids) => { setSelected(new Set(ids)); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [isAuthenticated, bookId, isUserBook])

  if (!isAuthenticated || moods.length === 0 || !loaded) return null

  const toggle = async (moodId: string) => {
    if (saving || !bookId) return
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
    } catch {
      setSelected(selected)
    }
    setSaving(false)
  }

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
