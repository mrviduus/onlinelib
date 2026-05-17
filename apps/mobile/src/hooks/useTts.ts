import { useCallback, useEffect, useRef, useState } from 'react'
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio'
import * as FileSystem from 'expo-file-system/legacy'
import { API_URL } from '../lib/api'
import { trackTtsPlayed } from '../lib/analytics'

/**
 * Maps our app language codes to BCP-47 identifiers passed through to
 * the backend /api/tts endpoint. The backend picks an Edge TTS voice
 * appropriate for the locale (see TtsEndpoints.cs).
 */
function toBcp47(lang?: string): string {
  if (!lang) return 'en-US'
  const lc = lang.toLowerCase()
  if (lc.startsWith('en')) return 'en-US'
  if (lc.includes('-')) return lang
  return 'en-US'
}

/** Cheap deterministic 32-bit djb2 hash used as a filename component. Combined
 *  with the input length for collision resistance — two different strings would
 *  need identical hash AND identical length to share a cache file. */
function hashKey(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i)
  return (h >>> 0).toString(16) + '-' + s.length.toString(16)
}

const CACHE_DIR = `${FileSystem.cacheDirectory ?? ''}tts/`
let cacheDirReady: Promise<void> | null = null
async function ensureCacheDir() {
  if (cacheDirReady) return cacheDirReady
  cacheDirReady = (async () => {
    try {
      const info = await FileSystem.getInfoAsync(CACHE_DIR)
      if (!info.exists) await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true })
    } catch {
      // Best-effort — if FS is unavailable we still attempt downloads to the
      // app's cache root inline below.
    }
  })()
  return cacheDirReady
}

async function audioModeReady() {
  // playsInSilentMode=true so iOS silent-switch doesn't kill word/sentence
  // playback during reading. Mirrors apps/web autoplay-unlock heuristic.
  try {
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false })
  } catch {
    // No-op — module may not be available in test contexts.
  }
}

/** Resolve the on-disk path for a cached MP3, downloading if needed. Returns
 *  null on download failure so the caller can degrade gracefully. */
async function getOrFetchAudio(text: string, lang: string, rate: number): Promise<string | null> {
  await ensureCacheDir()
  const speed = rate.toFixed(2)
  const cacheKey = hashKey(`${lang}|${speed}|${text}`)
  const file = `${CACHE_DIR}${cacheKey}.mp3`
  try {
    const info = await FileSystem.getInfoAsync(file)
    if (info.exists && info.size && info.size > 0) return file
  } catch {
    // Treat read errors as cache miss; we'll attempt to download below.
  }
  const url = `${API_URL}/tts?text=${encodeURIComponent(text)}&lang=${encodeURIComponent(lang)}&speed=${encodeURIComponent(speed)}`
  try {
    const res = await FileSystem.downloadAsync(url, file)
    if (res.status >= 200 && res.status < 300) return file
    // Non-2xx: clean the bogus file so the next call retries fresh.
    await FileSystem.deleteAsync(file, { idempotent: true }).catch(() => {})
    return null
  } catch {
    await FileSystem.deleteAsync(file, { idempotent: true }).catch(() => {})
    return null
  }
}

export interface TtsSpeakOptions {
  lang?: string
  rate?: number
}

export function useTts() {
  const [isSpeaking, setIsSpeaking] = useState(false)
  // One player instance per hook usage. createAudioPlayer (vs useAudioPlayer)
  // gives us direct control over replace/release without a re-render cycle.
  const playerRef = useRef<AudioPlayer | null>(null)
  // Monotonic counter — every new speak() call invalidates any pending
  // download from a previous call, so the user's latest word wins races.
  const reqRef = useRef(0)

  const releasePlayer = useCallback(() => {
    const p = playerRef.current
    if (!p) return
    try {
      p.pause()
      ;(p as { remove?: () => void }).remove?.()
    } catch {
      // ignore release errors
    }
    playerRef.current = null
  }, [])

  const stop = useCallback(() => {
    // Bump req so any in-flight download knows it's stale.
    reqRef.current++
    releasePlayer()
    setIsSpeaking(false)
  }, [releasePlayer])

  const speak = useCallback(
    async (text: string, opts: TtsSpeakOptions | number = {}) => {
      const trimmed = text.trim()
      if (!trimmed) return
      const normalized: TtsSpeakOptions = typeof opts === 'number' ? { rate: opts } : opts
      const rate = normalized.rate ?? 1.0
      const bcp47 = toBcp47(normalized.lang)
      const req = ++reqRef.current

      // Tear down any current playback before starting another download —
      // bites the same race expo-speech.stop() handles, just made explicit.
      releasePlayer()
      setIsSpeaking(true)

      const spaceCount = trimmed.split(/\s+/).length
      const kind: 'word' | 'sentence' | 'selection' =
        spaceCount === 1 ? 'word' : spaceCount <= 20 ? 'sentence' : 'selection'
      trackTtsPlayed({ language: bcp47.split('-')[0], kind })

      await audioModeReady()
      const file = await getOrFetchAudio(trimmed, bcp47, rate)
      // Another speak() ran while we were downloading — drop this one.
      if (req !== reqRef.current) return
      if (!file) {
        setIsSpeaking(false)
        return
      }

      try {
        const player = createAudioPlayer(file)
        playerRef.current = player
        try { player.setPlaybackRate(1.0) } catch { /* rate already baked in by server */ }
        // playbackStatusUpdate is the SDK 55 spelling; older betas used
        // statusChange. Either way we just flip isSpeaking on finish.
        player.addListener('playbackStatusUpdate', status => {
          if (status.didJustFinish) {
            setIsSpeaking(false)
            releasePlayer()
          }
        })
        player.play()
      } catch {
        setIsSpeaking(false)
        releasePlayer()
      }
    },
    [releasePlayer],
  )

  const toggle = useCallback(
    (text: string, opts: TtsSpeakOptions | number = {}) => {
      if (isSpeaking) stop()
      else void speak(text, opts)
    },
    [isSpeaking, speak, stop],
  )

  useEffect(() => {
    return () => {
      reqRef.current++
      releasePlayer()
    }
  }, [releasePlayer])

  return { speak, stop, toggle, isSpeaking }
}
