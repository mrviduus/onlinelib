import { useRef, useCallback } from 'react'
import * as Haptics from 'expo-haptics'
import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = 'review.hapticsEnabled'

export function useHaptics() {
  const enabled = useRef(true)
  const loaded = useRef(false)

  if (!loaded.current) {
    loaded.current = true
    AsyncStorage.getItem(STORAGE_KEY).then(v => {
      if (v !== null) enabled.current = v !== 'false'
    })
  }

  const play = useCallback((type: 'correct' | 'wrong' | 'flip' | 'complete') => {
    if (!enabled.current) return
    switch (type) {
      case 'correct':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
        break
      case 'wrong':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        break
      case 'flip':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        break
      case 'complete':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        break
    }
  }, [])

  const toggle = useCallback(() => {
    enabled.current = !enabled.current
    AsyncStorage.setItem(STORAGE_KEY, String(enabled.current))
    return enabled.current
  }, [])

  const isEnabled = useCallback(() => enabled.current, [])

  return { play, toggle, isEnabled }
}
