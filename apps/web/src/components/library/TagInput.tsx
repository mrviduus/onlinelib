import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { TagPill } from './TagPill'
import { useUserTags } from '../../hooks/useUserTags'

const MAX_TAGS = 20
const MAX_TAG_LENGTH = 50

export function normalizeTag(input: string): string {
  const lowered = (input || '').trim().toLowerCase()
  const collapsed = lowered.replace(/\s+/g, '-')
  return Array.from(collapsed).filter((c) => /[a-z0-9-]/.test(c)).join('').slice(0, MAX_TAG_LENGTH)
}

interface Props {
  value: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
}

export function TagInput({ value, onChange, disabled }: Props) {
  const { t } = useTranslation()
  const { tags: allTags } = useUserTags()
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const suggestions = useMemo(() => {
    const q = normalizeTag(draft)
    const present = new Set(value)
    const pool = allTags
      .map((t) => t.tag)
      .filter((t) => !present.has(t))
    if (!q) return pool.slice(0, 8)
    return pool.filter((t) => t.includes(q)).slice(0, 8)
  }, [allTags, draft, value])

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const addTag = (raw: string) => {
    const tag = normalizeTag(raw)
    if (!tag) return
    if (value.includes(tag)) return
    if (value.length >= MAX_TAGS) return
    onChange([...value, tag])
    setDraft('')
  }

  const removeTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag))
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      if (draft.trim()) {
        e.preventDefault()
        addTag(draft)
      }
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      e.preventDefault()
      removeTag(value[value.length - 1])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const limitReached = value.length >= MAX_TAGS

  return (
    <div ref={wrapRef} className="tag-input">
      <div className="tag-input__pills">
        {value.map((tag) => (
          <TagPill key={tag} tag={tag} removable onRemove={() => removeTag(tag)} />
        ))}
        <input
          ref={inputRef}
          type="text"
          className="tag-input__field"
          value={draft}
          placeholder={limitReached ? t('library.tags.limit') : t('library.tags.placeholder')}
          maxLength={MAX_TAG_LENGTH}
          disabled={disabled || limitReached}
          onChange={(e) => { setDraft(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          aria-label={t('library.tags.add')}
        />
      </div>
      {open && suggestions.length > 0 && (
        <ul className="tag-input__suggestions" role="listbox">
          {suggestions.map((tag) => (
            <li key={tag}>
              <button
                type="button"
                className="tag-input__suggestion"
                onMouseDown={(e) => { e.preventDefault(); addTag(tag) }}
              >
                #{tag}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
