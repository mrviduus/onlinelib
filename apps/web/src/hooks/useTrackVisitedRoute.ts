import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { pushRecentRoute } from '../lib/commands'

// Strip language prefix (/en/foo → /foo) so palette doesn't bias one language.
function stripLangPrefix(pathname: string): string {
  return pathname.replace(/^\/[a-z]{2}(?=\/|$)/, '') || '/'
}

export function useTrackVisitedRoute() {
  const location = useLocation()
  useEffect(() => {
    pushRecentRoute(stripLangPrefix(location.pathname))
  }, [location.pathname])
}
