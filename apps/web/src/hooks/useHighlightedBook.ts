import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

// Reads ?highlight=<bookId> from the URL, exposes the id to consumers (so a
// card can render itself with a pulse), strips the param so a refresh doesn't
// re-trigger, and scrolls the matching card into view once it mounts.
//
// Card lookup: any element with `data-book-id="<id>"`. LibraryPage cards in
// both list and grid modes carry that attribute (added in this commit).
//
// Pulse holds for 2.4s — long enough to register, short enough not to nag.
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
    const timer = window.setTimeout(() => setHighlightedId(null), 2400)
    return () => window.clearTimeout(timer)
  }, [search, pathname, navigate])

  // Scroll the highlighted card into view once it mounts. We poll briefly
  // because the card may render after this hook fires (data fetch races).
  useEffect(() => {
    if (!highlightedId) return
    let attempts = 0
    const tick = () => {
      const el = document.querySelector<HTMLElement>(`[data-book-id="${CSS.escape(highlightedId)}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }
      if (attempts++ < 20) window.setTimeout(tick, 150)
    }
    // Defer one frame so React commits the new card list before we query.
    window.requestAnimationFrame(tick)
  }, [highlightedId])

  return highlightedId
}
