import { useState, useCallback } from 'react'
import * as Speech from 'expo-speech'

export function useTts() {
  const [isSpeaking, setIsSpeaking] = useState(false)

  const speak = useCallback((text: string, rate: number = 1.0) => {
    Speech.stop()
    setIsSpeaking(true)
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
