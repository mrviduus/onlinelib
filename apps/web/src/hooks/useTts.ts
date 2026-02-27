import { useCallback, useRef, useState } from 'react'
import { fetchTtsAudio } from '../api/tts'
import { getCachedTtsAudio, cacheTtsAudio } from '../lib/offlineDb'

let sharedAudio: HTMLAudioElement | null = null
let currentBlobUrl: string | null = null

function getAudio(): HTMLAudioElement {
  if (!sharedAudio) sharedAudio = new Audio()
  return sharedAudio
}

function cleanup() {
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl)
    currentBlobUrl = null
  }
}

export function useTts() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    const audio = getAudio()
    audio.pause()
    audio.src = ''
    cleanup()
    setIsPlaying(false)
    setIsLoading(false)
  }, [])

  const speak = useCallback(async (text: string, lang: string, voice?: string, speed?: number) => {
    // Stop any current playback
    stop()

    const controller = new AbortController()
    abortRef.current = controller

    setIsLoading(true)
    try {
      // Try IndexedDB cache first
      let audioData: ArrayBuffer | null = null
      try {
        const cached = await getCachedTtsAudio(lang, text)
        if (cached) audioData = cached.audioData
      } catch { /* ignore cache errors */ }

      if (controller.signal.aborted) return

      // Fetch from API if not cached
      if (!audioData) {
        audioData = await fetchTtsAudio(text, lang, voice, speed)
        if (controller.signal.aborted) return
        // Cache for offline
        try { await cacheTtsAudio(lang, text, audioData) } catch { /* ignore */ }
      }

      if (controller.signal.aborted) return

      // Play
      cleanup()
      const blob = new Blob([audioData], { type: 'audio/mpeg' })
      currentBlobUrl = URL.createObjectURL(blob)
      const audio = getAudio()
      audio.src = currentBlobUrl

      audio.onended = () => {
        setIsPlaying(false)
        cleanup()
      }
      audio.onerror = () => {
        setIsPlaying(false)
        cleanup()
      }

      setIsLoading(false)
      setIsPlaying(true)
      await audio.play()
    } catch (err) {
      if (!controller.signal.aborted) {
        console.error('TTS error:', err)
        setIsLoading(false)
        setIsPlaying(false)
      }
    }
  }, [stop])

  return { speak, stop, isPlaying, isLoading }
}
