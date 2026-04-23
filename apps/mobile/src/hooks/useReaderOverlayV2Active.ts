import { useEffect, useState } from 'react'
import { FEATURES, readReaderOverlayV2Active } from '../lib/features'

// Resolve overlay v2 state for the current device. Initial value = build default
// (no flicker for the common case). On mount, re-reads AsyncStorage and updates
// if a per-device override is set.
export function useReaderOverlayV2Active(): boolean {
  const [active, setActive] = useState<boolean>(FEATURES.readerOverlayV2)
  useEffect(() => {
    let cancelled = false
    readReaderOverlayV2Active().then((v) => {
      if (!cancelled) setActive(v)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return active
}
