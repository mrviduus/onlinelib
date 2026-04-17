import { useRef, useCallback, useEffect } from 'react'
import * as Haptics from 'expo-haptics'
import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = 'review.hapticsEnabled'

export function useHaptics() {
  // Default to disabled until AsyncStorage resolves (P3-1). Otherwise a
  // user who has explicitly opted out of haptics still feels the first
  // buzz on mount while the preference is still loading.
  const enabled = useRef(false)
  const loaded = useRef(false)

  useEffect(() => {
    let cancelled = false
    AsyncStorage.getItem(STORAGE_KEY)
      .then(v => {
        if (cancelled) return
        // null → user has never toggled, default to on.
        // 'false' → explicit opt-out.
        enabled.current = v === null ? true : v !== 'false'
        loaded.current = true
      })
      .catch(() => {
        if (cancelled) return
        // If storage is unreadable, treat it as the default (on). Better
        // to honour the default than to silently drop haptics forever.
        enabled.current = true
        loaded.current = true
      })
    return () => { cancelled = true }
  }, [])

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
    // Once the user explicitly toggles, they've made a choice — mark
    // loaded so `play` honours it even if the initial read hasn't yet
    // resolved.
    enabled.current = !enabled.current
    loaded.current = true
    AsyncStorage.setItem(STORAGE_KEY, String(enabled.current)).catch(() => {})
    return enabled.current
  }, [])

  const isEnabled = useCallback(() => enabled.current, [])

  return { play, toggle, isEnabled }
}
