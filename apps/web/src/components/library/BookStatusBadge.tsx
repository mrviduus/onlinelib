import { useTranslation } from '../../hooks/useTranslation'

export type BookStatusVariant = 'processing' | 'failed' | 'new' | 'finished'

interface BookStatusBadgeProps {
  variant: BookStatusVariant
  onClick?: (e?: React.MouseEvent) => void
  title?: string
}

export function BookStatusBadge({ variant, onClick, title }: BookStatusBadgeProps) {
  const { t } = useTranslation()
  const label = t(`library.badge.${variant}`)
  const interactive = !!onClick

  const Tag: any = interactive ? 'button' : 'span'

  return (
    <Tag
      type={interactive ? 'button' : undefined}
      className={`book-status-badge book-status-badge--${variant}`}
      onClick={onClick}
      title={title}
      aria-label={label}
    >
      {variant === 'processing' && <span className="book-status-badge__spinner" aria-hidden="true" />}
      {variant === 'finished' && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      <span className="book-status-badge__text">{label}</span>
    </Tag>
  )
}
