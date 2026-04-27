import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDebounce } from './useDebounce'

export type LibraryTab = 'saved' | 'uploads'

export function useLibrarySearch(tab: LibraryTab) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQueryState] = useState<string>(() => searchParams.get('q') ?? '')
  const debouncedQuery = useDebounce(query, 150)
  const skipNextTabSync = useRef(true)

  useEffect(() => {
    if (skipNextTabSync.current) { skipNextTabSync.current = false; return }
    setQueryState('')
  }, [tab])

  useEffect(() => {
    setSearchParams(prev => {
      const sp = new URLSearchParams(prev)
      if (debouncedQuery) sp.set('q', debouncedQuery)
      else sp.delete('q')
      return sp
    }, { replace: true })
  }, [debouncedQuery, setSearchParams])

  // sync FROM url when it changes externally (e.g. tag pill click)
  const urlQ = searchParams.get('q') ?? ''
  useEffect(() => {
    if (urlQ !== query) setQueryState(urlQ)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQ])

  const setQuery = useCallback((next: string) => { setQueryState(next) }, [])
  const clear = useCallback(() => { setQueryState('') }, [])

  return { query, debouncedQuery, setQuery, clear }
}
