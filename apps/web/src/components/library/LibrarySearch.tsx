import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { useTranslation } from '../../hooks/useTranslation'

export interface LibrarySearchHandle {
  focus: () => void
}

interface Props {
  value: string
  onChange: (next: string) => void
}

export const LibrarySearch = forwardRef<LibrarySearchHandle, Props>(function LibrarySearch({ value, onChange }, ref) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="library-search">
      <span className="material-icons-outlined library-search__icon">search</span>
      <input
        ref={inputRef}
        type="search"
        className="library-search__input"
        placeholder={t('library.search.placeholder')}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') {
            e.preventDefault()
            onChange('')
            inputRef.current?.focus()
          }
        }}
        aria-label={t('library.search.placeholder')}
      />
      {value && (
        <button
          type="button"
          className="library-search__clear"
          onClick={() => { onChange(''); inputRef.current?.focus() }}
          aria-label={t('library.search.clear')}
        >
          <span className="material-icons-outlined">close</span>
        </button>
      )}
    </div>
  )
})
