import { useCallback, useEffect, useState } from 'react'

export type LibraryScope = 'library'

export function useLibrarySearch(_scope: LibraryScope) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 150)
    return () => clearTimeout(id)
  }, [query])

  const clear = useCallback(() => { setQuery('') }, [])

  return { query, debouncedQuery, setQuery, clear }
}
