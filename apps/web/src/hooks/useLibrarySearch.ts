import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDebounce } from './useDebounce'

export function useLibrarySearch() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQueryState] = useState<string>(() => searchParams.get('q') ?? '')
  const [contentSearch, setContentSearchState] = useState<boolean>(() => searchParams.get('content') === '1')
  const debounceMs = contentSearch ? 250 : 150
  const debouncedQuery = useDebounce(query, debounceMs)

  useEffect(() => {
    setSearchParams(prev => {
      const sp = new URLSearchParams(prev)
      if (debouncedQuery) sp.set('q', debouncedQuery)
      else sp.delete('q')
      if (contentSearch) sp.set('content', '1')
      else sp.delete('content')
      return sp
    }, { replace: true })
  }, [debouncedQuery, contentSearch, setSearchParams])

  // sync FROM url when it changes externally (e.g. tag pill click)
  const urlQ = searchParams.get('q') ?? ''
  useEffect(() => {
    if (urlQ !== query) setQueryState(urlQ)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQ])

  const setQuery = useCallback((next: string) => { setQueryState(next) }, [])
  const clear = useCallback(() => { setQueryState('') }, [])
  const setContentSearch = useCallback((next: boolean) => { setContentSearchState(next) }, [])

  return { query, debouncedQuery, setQuery, clear, contentSearch, setContentSearch }
}
