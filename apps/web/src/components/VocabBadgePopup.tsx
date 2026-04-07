import { useEffect, useRef } from 'react'
import { LocalizedLink } from './LocalizedLink'

interface VocabBadgePopupProps {
  reviewed: number
  due: number
  streak: number
  onClose: () => void
}

export function VocabBadgePopup({ reviewed, due, streak, onClose }: VocabBadgePopupProps) {
  const ref = useRef<HTMLDivElement>(null)
  const complete = due === 0 && reviewed > 0
  const total = reviewed + due

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div className="vocab-badge-popup" ref={ref}>
      <div className="vocab-badge-popup__header">
        {streak > 0
          ? `${streak} Day Streak`
          : 'Vocabulary'}
      </div>
      <div className="vocab-badge-popup__status">
        {complete
          ? "Today's goal met!"
          : `${reviewed} of ${total} words reviewed`}
      </div>
      <div className="vocab-badge-popup__stats">
        <div className="vocab-badge-popup__stat">
          <span className="vocab-badge-popup__stat-value">{reviewed}</span>
          <span className="vocab-badge-popup__stat-label">Reviewed</span>
        </div>
        <div className="vocab-badge-popup__stat">
          <span className="vocab-badge-popup__stat-value">{due}</span>
          <span className="vocab-badge-popup__stat-label">Due</span>
        </div>
      </div>
      {due > 0 && (
        <LocalizedLink to="/words/review" className="vocab-badge-popup__btn" onClick={onClose}>
          Review now ({due})
        </LocalizedLink>
      )}
    </div>
  )
}
