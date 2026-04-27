import { useCallback, useEffect, useState } from 'react'

export type LibraryTab = 'saved' | 'uploads'

export function useLibrarySearch(_tab: LibraryTab) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 150)
    return () => clearTimeout(id)
  }, [query])

  const clear = useCallback(() => { setQuery('') }, [])

  return { query, debouncedQuery, setQuery, clear }
}
