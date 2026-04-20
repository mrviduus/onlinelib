import { useEffect, useState } from 'react'
import { getHotspots, type Hotspot } from '../api/socialHighlights'

const REFRESH_INTERVAL_MS = 2 * 60 * 1000

export function useHotspots(editionId: string | undefined | null, chapterId: string | undefined | null) {
  const [hotspots, setHotspots] = useState<Hotspot[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!editionId || !chapterId) {
      setHotspots([])
      return
    }
    let cancelled = false
    const load = () => {
      setLoading(true)
      getHotspots(editionId, chapterId)
        .then(data => { if (!cancelled) { setHotspots(data); setError(null) } })
        .catch(e => { if (!cancelled) setError(e as Error) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }
    load()
    const id = setInterval(() => {
      if (!document.hidden) load()
    }, REFRESH_INTERVAL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [editionId, chapterId])

  return { hotspots, loading, error, setHotspots }
}
