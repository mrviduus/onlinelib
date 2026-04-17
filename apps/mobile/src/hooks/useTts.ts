import { useCallback, useEffect, useRef, useState } from 'react'
import * as Speech from 'expo-speech'
import { trackTtsPlayed } from '../lib/analytics'

/**
 * Maps our app language codes ('en', 'uk') to BCP-47 identifiers that
 * expo-speech understands. Falls back to 'en-US' for anything we don't
 * explicitly know so Speech doesn't silently fail on an unrecognised tag.
 */
function toBcp47(lang?: string): string {
  if (!lang) return 'en-US'
  const lc = lang.toLowerCase()
  if (lc.startsWith('en')) return 'en-US'
  if (lc.startsWith('uk')) return 'uk-UA'
  // Already a BCP-47 tag? Pass through. expo-speech tolerates unknown codes
  // by falling back to the system default voice.
  if (lc.includes('-')) return lang
  return 'en-US'
}

export interface TtsSpeakOptions {
  lang?: string
  rate?: number
}

export function useTts() {
  const [isSpeaking, setIsSpeaking] = useState(false)
  // Track whether we currently "own" an expo-speech utterance so unmount can
  // cancel it. Without this, navigating away mid-speech leaves the device
  // reading into the void while the user is on a different screen.
  const speakingRef = useRef(false)

  const stop = useCallback(() => {
    Speech.stop()
    speakingRef.current = false
    setIsSpeaking(false)
  }, [])

  const speak = useCallback(
    (text: string, opts: TtsSpeakOptions | number = {}) => {
      // Back-compat: older callers pass rate as a positional number. Normalise.
      const normalized: TtsSpeakOptions =
        typeof opts === 'number' ? { rate: opts } : opts
      const rate = normalized.rate ?? 1.0
      const bcp47 = toBcp47(normalized.lang)

      Speech.stop()
      speakingRef.current = true
      setIsSpeaking(true)

      const spaceCount = text.trim().split(/\s+/).length
      const kind: 'word' | 'sentence' | 'selection' =
        spaceCount === 1 ? 'word' : spaceCount <= 20 ? 'sentence' : 'selection'
      // Report the resolved language so analytics isn't a lie for UK/other
      // locale books. Strip region for brevity — 'en-US' → 'en'.
      trackTtsPlayed({ language: bcp47.split('-')[0], kind })

      Speech.speak(text, {
        language: bcp47,
        rate,
        onDone: () => {
          speakingRef.current = false
          setIsSpeaking(false)
        },
        onStopped: () => {
          speakingRef.current = false
          setIsSpeaking(false)
        },
        onError: () => {
          speakingRef.current = false
          setIsSpeaking(false)
        },
      })
    },
    [],
  )

  const toggle = useCallback(
    (text: string, opts: TtsSpeakOptions | number = {}) => {
      if (isSpeaking) {
        stop()
      } else {
        speak(text, opts)
      }
    },
    [isSpeaking, speak, stop],
  )

  // On unmount, cancel any utterance we started. Multiple hook instances are
  // fine — each owns its own ref — but the global Speech engine can only
  // voice one utterance at a time, so cancelling on unmount is always safe.
  useEffect(() => {
    return () => {
      if (speakingRef.current) {
        Speech.stop()
        speakingRef.current = false
      }
    }
  }, [])

  return { speak, stop, toggle, isSpeaking }
}
