import { useState } from 'react'
import { adminApi } from '../api/client'
import './CreateAuthorModal.css'

interface CreateAuthorModalProps {
  siteId: string
  initialName: string
  onCreated: (author: { id: string; name: string }) => void
  onCancel: () => void
}

export function CreateAuthorModal({
  siteId,
  initialName,
  onCreated,
  onCancel
}: CreateAuthorModalProps) {
  const [name, setName] = useState(initialName)
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
      const result = await adminApi.createAuthor(siteId, trimmed)
      onCreated({ id: result.id, name: result.name })
    } catch (err) {
      console.error('Create author failed:', err)
      setError('Failed to create author')
      setIsLoading(false)
    }
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCancel()
    }
  }

  return (
    <div className="create-author-modal__backdrop" onClick={handleBackdropClick}>
      <div className="create-author-modal">
        <h3 className="create-author-modal__title">Create New Author</h3>

        <form onSubmit={handleSubmit}>
          <div className="create-author-modal__field">
            <label htmlFor="author-name">Name</label>
            <input
              id="author-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              disabled={isLoading}
            />
          </div>

          {error && <p className="create-author-modal__error">{error}</p>}

          <div className="create-author-modal__actions">
            <button
              type="button"
              className="create-author-modal__btn create-author-modal__btn--cancel"
              onClick={onCancel}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="create-author-modal__btn create-author-modal__btn--create"
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
