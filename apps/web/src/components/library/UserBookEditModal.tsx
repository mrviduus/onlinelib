import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { useUpdateUserBookMetadata } from '../../hooks/useUpdateUserBookMetadata'
import type { UserBook } from '../../api/userBooks'

interface Props {
  open: boolean
  book: UserBook
  onClose: () => void
  onSaved: () => void
}

const LANG_OPTIONS = ['en', 'uk', 'ru', 'es', 'fr', 'de', 'it', 'pt', 'pl', 'tr']

const TITLE_MAX = 200
const AUTHOR_MAX = 200
const GENRE_MAX = 100
const DESCRIPTION_MAX = 2000

export function UserBookEditModal({ open, book, onClose, onSaved }: Props) {
  const { t } = useTranslation()
  const { save, saving, error } = useUpdateUserBookMetadata()

  const [title, setTitle] = useState(book.title)
  const [author, setAuthor] = useState(book.author ?? '')
  const [language, setLanguage] = useState(book.language)
  const [genre, setGenre] = useState(book.genre ?? '')
  const [description, setDescription] = useState(book.description ?? '')

  const panelRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setTitle(book.title)
    setAuthor(book.author ?? '')
    setLanguage(book.language)
    setGenre(book.genre ?? '')
    setDescription(book.description ?? '')
  }, [open, book.id, book.title, book.author, book.language, book.genre, book.description])

  useEffect(() => {
    if (!open) return
    titleRef.current?.focus()
    titleRef.current?.select()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const trimmedTitle = title.trim()
  const titleError = !trimmedTitle ? t('library.editMetadata.errorTitleRequired')
    : trimmedTitle.length > TITLE_MAX ? t('library.editMetadata.errorTitleTooLong') : null
  const authorError = author.length > AUTHOR_MAX ? t('library.editMetadata.errorAuthorTooLong') : null
  const genreError = genre.length > GENRE_MAX ? t('library.editMetadata.errorGenreTooLong') : null
  const descriptionError = description.length > DESCRIPTION_MAX ? t('library.editMetadata.errorDescriptionTooLong') : null
  const isValid = !titleError && !authorError && !genreError && !descriptionError

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid || saving) return
    const result = await save(book.id, {
      title: trimmedTitle,
      author: author.trim() || null,
      language,
      genre: genre.trim() || null,
      description: description.trim() || null,
    })
    if (result) {
      onSaved()
      onClose()
    }
  }

  return (
    <div
      className="user-book-edit-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-meta-title"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="user-book-edit-modal__panel"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="edit-meta-title" className="user-book-edit-modal__title">
          {t('library.editMetadata.title')}
        </h2>

        <form className="user-book-edit-modal__form" onSubmit={submit}>
          <label className="user-book-edit-modal__field">
            <span className="user-book-edit-modal__label">
              {t('library.editMetadata.fieldTitle')}
            </span>
            <input
              ref={titleRef}
              type="text"
              value={title}
              maxLength={TITLE_MAX + 50}
              onChange={(e) => setTitle(e.target.value)}
              required
              aria-invalid={!!titleError}
              disabled={saving}
            />
            {titleError && <span className="user-book-edit-modal__err">{titleError}</span>}
          </label>

          <label className="user-book-edit-modal__field">
            <span className="user-book-edit-modal__label">
              {t('library.editMetadata.fieldAuthor')}
            </span>
            <input
              type="text"
              value={author}
              maxLength={AUTHOR_MAX + 50}
              onChange={(e) => setAuthor(e.target.value)}
              aria-invalid={!!authorError}
              disabled={saving}
            />
            {authorError && <span className="user-book-edit-modal__err">{authorError}</span>}
          </label>

          <label className="user-book-edit-modal__field">
            <span className="user-book-edit-modal__label">
              {t('library.editMetadata.fieldLanguage')}
            </span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={saving}
            >
              {!LANG_OPTIONS.includes(language) && (
                <option value={language}>{language}</option>
              )}
              {LANG_OPTIONS.map((code) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
          </label>

          <label className="user-book-edit-modal__field">
            <span className="user-book-edit-modal__label">
              {t('library.editMetadata.fieldGenre')}
            </span>
            <input
              type="text"
              value={genre}
              maxLength={GENRE_MAX + 50}
              onChange={(e) => setGenre(e.target.value)}
              aria-invalid={!!genreError}
              disabled={saving}
            />
            {genreError && <span className="user-book-edit-modal__err">{genreError}</span>}
          </label>

          <label className="user-book-edit-modal__field">
            <span className="user-book-edit-modal__label">
              {t('library.editMetadata.fieldDescription')}
            </span>
            <textarea
              value={description}
              maxLength={DESCRIPTION_MAX + 100}
              rows={4}
              onChange={(e) => setDescription(e.target.value)}
              aria-invalid={!!descriptionError}
              disabled={saving}
            />
            <span className="user-book-edit-modal__counter">
              {description.length} / {DESCRIPTION_MAX}
            </span>
            {descriptionError && <span className="user-book-edit-modal__err">{descriptionError}</span>}
          </label>

          {error && <div className="user-book-edit-modal__server-err" role="alert">{error}</div>}

          <div className="user-book-edit-modal__actions">
            <button
              type="button"
              className="user-book-edit-modal__btn"
              onClick={onClose}
              disabled={saving}
            >
              {t('library.editMetadata.cancel')}
            </button>
            <button
              type="submit"
              className="user-book-edit-modal__btn user-book-edit-modal__btn--primary"
              disabled={!isValid || saving}
            >
              {saving ? t('library.editMetadata.saving') : t('library.editMetadata.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
