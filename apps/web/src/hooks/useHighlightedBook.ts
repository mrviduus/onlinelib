import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

export function useHighlightedBook(): string | null {
  const { search, pathname } = useLocation()
  const navigate = useNavigate()
  const [highlightedId, setHighlightedId] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(search)
    const id = params.get('highlight')
    if (!id) return
    setHighlightedId(id)
    params.delete('highlight')
    const next = params.toString()
    navigate(next ? `${pathname}?${next}` : pathname, { replace: true })
    const timer = window.setTimeout(() => setHighlightedId(null), 2000)
    return () => window.clearTimeout(timer)
  }, [search, pathname, navigate])

  return highlightedId
}
