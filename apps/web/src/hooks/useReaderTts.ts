import { useCallback, useEffect, useState } from 'react'
import { useTts } from './useTts'

interface Params {
  bookLanguage: string
  ttsSpeed: number
  autoPlayWord: string | null
}

export interface UseReaderTtsResult {
  spokenText: string | null
  timestamps: ReturnType<typeof useTts>['timestamps']
  currentWordIndex: number
  isPlaying: boolean
  speak: (text: string, lang?: string) => void
  stop: () => void
}

export function useReaderTts({ bookLanguage, ttsSpeed, autoPlayWord }: Params): UseReaderTtsResult {
  const { speak: ttsSpeak, stop: ttsStop, isPlaying, timestamps, currentWordIndex } = useTts()
  // Captured at speak() time so the overlay has text to split + highlight even
  // after the selection is cleared. Cleared explicitly on stop() — relying on
  // `isPlaying` alone would leave the last text flashing between playbacks.
  const [spokenText, setSpokenText] = useState<string | null>(null)

  const speak = useCallback((text: string, lang?: string) => {
    setSpokenText(text)
    ttsSpeak(text, lang || bookLanguage, undefined, ttsSpeed)
  }, [ttsSpeak, bookLanguage, ttsSpeed])

  const stop = useCallback(() => {
    ttsStop()
    setSpokenText(null)
  }, [ttsStop])

  // Auto-play when bubble opens on a new word (not on translation/definition arrival).
  useEffect(() => {
    if (autoPlayWord) speak(autoPlayWord)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlayWord])

  return { spokenText, timestamps, currentWordIndex, isPlaying, speak, stop }
}
