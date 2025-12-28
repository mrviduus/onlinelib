import { useState } from 'react'
import { adminApi } from '../api/client'
import './CreateGenreModal.css'

interface CreateGenreModalProps {
  siteId: string
  onCreated: (genre: { id: string; name: string }) => void
  onCancel: () => void
}

export function CreateGenreModal({
  siteId,
  onCreated,
  onCancel
}: CreateGenreModalProps) {
  const [name, setName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed.length < 2) {
      setError('Name must be at least 2 characters')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const result = await adminApi.createGenre(siteId, trimmed)
      onCreated({ id: result.id, name: result.name })
    } catch (err) {
      console.error('Create genre failed:', err)
      setError('Failed to create genre')
      setIsLoading(false)
    }
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCancel()
    }
  }

  return (
    <div className="create-genre-modal__backdrop" onClick={handleBackdropClick}>
      <div className="create-genre-modal">
        <h3 className="create-genre-modal__title">Create New Genre</h3>

        <form onSubmit={handleSubmit}>
          <div className="create-genre-modal__field">
            <label htmlFor="genre-name">Name</label>
            <input
              id="genre-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              disabled={isLoading}
            />
          </div>

          {error && <p className="create-genre-modal__error">{error}</p>}

          <div className="create-genre-modal__actions">
            <button
              type="button"
              className="create-genre-modal__btn create-genre-modal__btn--cancel"
              onClick={onCancel}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="create-genre-modal__btn create-genre-modal__btn--create"
              disabled={isLoading || name.trim().length < 2}
            >
              {isLoading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
