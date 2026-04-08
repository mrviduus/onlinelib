import { useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useGuestLimits } from '../context/GuestLimitsContext'
import { saveWord } from '../api/vocabulary'

export function useGuestMigration() {
  const { isAuthenticated } = useAuth()
  const { guestState, resetGuestState } = useGuestLimits()
  const migratedRef = useRef(false)

  useEffect(() => {
    if (!isAuthenticated || migratedRef.current) return
    if (guestState.savedWords.length === 0) return

    migratedRef.current = true
    const words = [...guestState.savedWords]

    // Migrate words sequentially to avoid overwhelming the API
    ;(async () => {
      for (const w of words) {
        try {
          await saveWord({
            word: w.word,
            language: w.language,
            translation: w.translation,
          })
        } catch {
          // Skip failed words silently
        }
      }
      resetGuestState()
    })()
  }, [isAuthenticated, guestState.savedWords, resetGuestState])
}
