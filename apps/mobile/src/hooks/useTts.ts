import { useState, useCallback } from 'react'
import * as Speech from 'expo-speech'
import { trackTtsPlayed } from '../lib/analytics'

export function useTts() {
  const [isSpeaking, setIsSpeaking] = useState(false)

  const speak = useCallback((text: string, rate: number = 1.0) => {
    Speech.stop()
    setIsSpeaking(true)
    const spaceCount = text.trim().split(/\s+/).length
    const kind: 'word' | 'sentence' | 'selection' = spaceCount === 1 ? 'word' : spaceCount <= 20 ? 'sentence' : 'selection'
    trackTtsPlayed({ language: 'en', kind })
    Speech.speak(text, {
      language: 'en-US',
      rate,
      onDone: () => setIsSpeaking(false),
      onStopped: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    })
  }, [])

  const stop = useCallback(() => {
    Speech.stop()
    setIsSpeaking(false)
  }, [])

  const toggle = useCallback((text: string, rate: number = 1.0) => {
    if (isSpeaking) {
      stop()
    } else {
      speak(text, rate)
    }
  }, [isSpeaking, speak, stop])

  return { speak, stop, toggle, isSpeaking }
}
