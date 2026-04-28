import { useCallback, useState } from 'react'
import type { LibraryFilterKey } from './useLibraryFilter'

export type LibraryStatus = LibraryFilterKey
export const DEFAULT_STATUS: LibraryStatus = 'reading'

export interface LibraryStatusState {
  status: LibraryStatus
  setStatus: (next: LibraryStatus) => void
}

export function useLibraryStatus(): LibraryStatusState {
  const [status, setStatusState] = useState<LibraryStatus>(DEFAULT_STATUS)
  const setStatus = useCallback((next: LibraryStatus) => setStatusState(next), [])
  return { status, setStatus }
}
