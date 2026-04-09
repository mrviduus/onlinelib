import { useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useGuestLimits } from '../context/GuestLimitsContext'
import { saveWord } from '../api/vocabulary'

export function useGuestMigration() {
  const { isAuthenticated, isGuest } = useAuth()
  const { guestState, resetGuestState } = useGuestLimits()
  const migratedRef = useRef(false)

  useEffect(() => {
    // Only migrate when user is authenticated AND not a guest (i.e., after registration/login)
    if (!isAuthenticated || isGuest || migratedRef.current) return
    if (guestState.savedWords.length === 0) return

    migratedRef.current = true
    const words = [...guestState.savedWords]

    ;(async () => {
      let migrated = 0
      for (const w of words) {
        try {
          await saveWord({
            word: w.word,
            language: w.language,
            translation: w.translation,
          })
          migrated++
        } catch {
          // Skip failed words
        }
      }
      if (migrated > 0) resetGuestState()
    })()
  }, [isAuthenticated, guestState.savedWords, resetGuestState])
}
