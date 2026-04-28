import { useCallback, useState } from 'react'
import {
  updateUserBookMetadata,
  type UpdateUserBookMetadataRequest,
  type UserBookDetail,
} from '../api/userBooks'

export function useUpdateUserBookMetadata() {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = useCallback(async (
    bookId: string,
    data: UpdateUserBookMetadataRequest,
  ): Promise<UserBookDetail | null> => {
    setSaving(true)
    setError(null)
    try {
      return await updateUserBookMetadata(bookId, data)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save'
      setError(msg)
      return null
    } finally {
      setSaving(false)
    }
  }, [])

  return { save, saving, error }
}
