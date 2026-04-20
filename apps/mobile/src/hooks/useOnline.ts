import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { API_URL } from '../lib/api'

const POLL_INTERVAL_MS = 30_000
const PROBE_TIMEOUT_MS = 5_000

async function probe(): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS)
    const res = await fetch(`${API_URL}/health`, { signal: ctrl.signal })
    clearTimeout(timer)
    return res.ok
  } catch {
    return false
  }
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      const ok = await probe()
      if (!cancelled) setOnline(ok)
    }
    tick()
    const id = setInterval(tick, POLL_INTERVAL_MS)
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick()
    })
    return () => {
      cancelled = true
      clearInterval(id)
      sub.remove()
    }
  }, [])

  return online
}
