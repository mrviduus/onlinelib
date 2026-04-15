import { useEffect, useRef } from 'react'
import { LocalizedLink } from './LocalizedLink'
import { DAILY_GOAL } from './StreakBadge'

interface VocabBadgePopupProps {
  reviewed: number
  due: number
  streak: number
  containerRef?: React.RefObject<HTMLDivElement | null>
  onClose: () => void
}

export function VocabBadgePopup({ reviewed, due, streak, containerRef, onClose }: VocabBadgePopupProps) {
  const ref = useRef<HTMLDivElement>(null)
  const goalMet = reviewed >= DAILY_GOAL

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const container = containerRef?.current || ref.current
      if (container && !container.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose, containerRef])

  return (
    <div className="vocab-badge-popup" ref={ref}>
      <div className="vocab-badge-popup__header">
        {streak > 0
          ? `${streak} Day Streak`
          : 'Vocabulary'}
      </div>
      <div className="vocab-badge-popup__status">
        {goalMet
          ? "Today's goal met!"
          : `${reviewed} of ${DAILY_GOAL} words reviewed`}
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
        <LocalizedLink to="/vocabulary" className="vocab-badge-popup__btn" onClick={onClose}>
          Review now ({due})
        </LocalizedLink>
      )}
    </div>
  )
}
