import { LocalizedLink } from './LocalizedLink'
import './EmptyState.css'

interface EmptyStateProps {
  icon?: string
  title: string
  subtitle?: string
  buttonLabel?: string
  buttonTo?: string
  onButtonClick?: () => void
  className?: string
}

export function EmptyState({ icon, title, subtitle, buttonLabel, buttonTo, onButtonClick, className }: EmptyStateProps) {
  return (
    <div className={`empty-state${className ? ` ${className}` : ''}`}>
      {icon && <div className="empty-state__icon">{icon}</div>}
      <p className="empty-state__title">{title}</p>
      {subtitle && <p className="empty-state__subtitle">{subtitle}</p>}
      {buttonLabel && buttonTo && (
        <LocalizedLink to={buttonTo} className="empty-state__btn">{buttonLabel}</LocalizedLink>
      )}
      {buttonLabel && onButtonClick && !buttonTo && (
        <button className="empty-state__btn" onClick={onButtonClick}>{buttonLabel}</button>
      )}
    </div>
  )
}
