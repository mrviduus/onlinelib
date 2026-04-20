import { useCallback, useEffect, useRef, useState } from 'react'
import type { Hotspot, HotspotTopNote } from '../../api/socialHighlights'
import { likeHighlight, unlikeHighlight } from '../../api/socialHighlights'
import { useTranslation } from '../../hooks/useTranslation'

interface HotspotPanelProps {
  hotspot: Hotspot
  isAuthenticated: boolean
  onClose: () => void
  onGuestBlock: () => void
  onReport: (highlightId: string) => void
  onLikedChange: (next: Hotspot) => void
}

const COLOR_DOTS: Record<string, string> = {
  yellow: '#fde047',
  green: '#86efac',
  pink: '#f9a8d4',
  blue: '#93c5fd',
}

export function HotspotPanel({
  hotspot,
  isAuthenticated,
  onClose,
  onGuestBlock,
  onReport,
  onLikedChange,
}: HotspotPanelProps) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const [pending, setPending] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [onClose])

  const toggleLike = useCallback(async (note: HotspotTopNote) => {
    if (!isAuthenticated) { onGuestBlock(); return }
    if (pending[note.highlightId]) return
    setPending(p => ({ ...p, [note.highlightId]: true }))
    try {
      const res = note.likedByMe
        ? await unlikeHighlight(note.highlightId)
        : await likeHighlight(note.highlightId)
      const nextNotes = hotspot.topNotes.map(n =>
        n.highlightId === note.highlightId
          ? { ...n, likedByMe: res.liked, likeCount: res.likeCount }
          : n
      )
      const likeDelta = (res.likeCount - note.likeCount)
      onLikedChange({ ...hotspot, topNotes: nextNotes, likeTotal: hotspot.likeTotal + likeDelta })
    } catch {
      // noop — UI stays consistent
    } finally {
      setPending(p => ({ ...p, [note.highlightId]: false }))
    }
  }, [hotspot, isAuthenticated, onGuestBlock, onLikedChange, pending])

  const snippet = hotspot.text.length > 160 ? hotspot.text.slice(0, 160) + '…' : hotspot.text

  return (
    <div ref={ref} className="hotspot-panel" role="dialog" aria-label={t('reader.hotspot.title')}>
      <header className="hotspot-panel__header">
        <div className="hotspot-panel__count">
          {t('reader.hotspot.count', { count: hotspot.count })}
        </div>
        <button
          className="hotspot-panel__close"
          aria-label={t('reader.hotspot.close')}
          onClick={onClose}
        >×</button>
      </header>

      <blockquote className="hotspot-panel__snippet">“{snippet}”</blockquote>

      <div className="hotspot-panel__notes">
        {hotspot.topNotes.length === 0 && (
          <div className="hotspot-panel__empty">{t('reader.hotspot.noNotes')}</div>
        )}
        {hotspot.topNotes.map(note => (
          <div key={note.highlightId} className="hotspot-note">
            <div className="hotspot-note__head">
              <span
                className="hotspot-note__dot"
                style={{ backgroundColor: COLOR_DOTS[note.color] || COLOR_DOTS.yellow }}
              />
              <span className="hotspot-note__author">{t('reader.hotspot.reader')}</span>
            </div>
            {note.noteText && (
              <p className="hotspot-note__text">{note.noteText}</p>
            )}
            <div className="hotspot-note__actions">
              <button
                className={`hotspot-note__like${note.likedByMe ? ' is-liked' : ''}`}
                onClick={() => toggleLike(note)}
                disabled={!!pending[note.highlightId]}
                aria-label={note.likedByMe ? t('reader.hotspot.unlike') : t('reader.hotspot.like')}
              >
                <HeartIcon filled={note.likedByMe} />
                <span>{note.likeCount}</span>
              </button>
              <button
                className="hotspot-note__report"
                onClick={() => {
                  if (!isAuthenticated) { onGuestBlock(); return }
                  onReport(note.highlightId)
                }}
              >
                {t('reader.hotspot.report')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  )
}
