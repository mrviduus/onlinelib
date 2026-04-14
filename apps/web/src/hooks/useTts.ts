import { useCallback, useRef, useState } from 'react'
import { fetchTtsAudio } from '../api/tts'
import { getCachedTtsAudio, cacheTtsAudio } from '../lib/offlineDb'

// Shared playback element + blob URL — a single TTS stream at a time.
let sharedAudio: HTMLAudioElement | null = null
let currentBlobUrl: string | null = null

// iOS Safari / mobile Chrome block `audio.play()` outside a user gesture
// (autoplay policy). We auto-play TTS from a useEffect that fires after
// STABILIZE_MS + state update + async fetch — way outside the gesture window.
// To work around: on the first user pointer/touch/key event, play a silent
// data-URI on the shared Audio element to "unlock" it for later programmatic
// plays. After unlock, subsequent `.play()` calls with real src work.
//
// 44-byte empty-PCM WAV (no samples) — enough to satisfy iOS unlock handshake.
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='
let audioUnlocked = false

function getAudio(): HTMLAudioElement {
  if (!sharedAudio) sharedAudio = new Audio()
  return sharedAudio
}

function unlockAudio() {
  if (audioUnlocked) return
  audioUnlocked = true
  const a = getAudio()
  const prevMuted = a.muted
  a.muted = true
  a.src = SILENT_WAV
  // Synchronous .play() in a user-gesture handler primes the element on iOS.
  // We swallow the promise; both resolve and reject count as the unlock on iOS.
  a.play()
    .catch(() => {})
    .finally(() => {
      a.pause()
      a.muted = prevMuted
    })
}

if (typeof document !== 'undefined') {
  const opts: AddEventListenerOptions = { once: true, passive: true, capture: true }
  document.addEventListener('pointerdown', unlockAudio, opts)
  document.addEventListener('touchstart', unlockAudio, opts)
  document.addEventListener('keydown', unlockAudio, opts)
}

function cleanup() {
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl)
    currentBlobUrl = null
  }
}

export type TtsError = 'blocked' | 'failed' | null

export function useTts() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<TtsError>(null)
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
    setError(null)

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
      try {
        await audio.play()
      } catch (err) {
        // NotAllowedError = browser blocked autoplay (no user gesture yet, or unlock missed).
        const name = (err as { name?: string })?.name
        setIsPlaying(false)
        cleanup()
        setError(name === 'NotAllowedError' ? 'blocked' : 'failed')
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        console.error('TTS error:', err)
        setIsLoading(false)
        setIsPlaying(false)
        setError('failed')
      }
    }
  }, [stop])

  return { speak, stop, isPlaying, isLoading, error }
}
