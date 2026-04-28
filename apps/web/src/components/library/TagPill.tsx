interface Props {
  tag: string
  active?: boolean
  onClick?: () => void
  onRemove?: () => void
  removable?: boolean
  size?: 'sm' | 'md'
}

export function TagPill({ tag, active, onClick, onRemove, removable, size = 'sm' }: Props) {
  const cls = `tag-pill tag-pill--${size}${active ? ' tag-pill--active' : ''}${onClick ? ' tag-pill--clickable' : ''}`
  const content = (
    <>
      <span className="tag-pill__text">#{tag}</span>
      {removable && (
        <button
          type="button"
          className="tag-pill__remove"
          aria-label={`Remove ${tag}`}
          onClick={(e) => { e.stopPropagation(); onRemove?.() }}
        >
          ×
        </button>
      )}
    </>
  )
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick}>
        {content}
      </button>
    )
  }
  return <span className={cls}>{content}</span>
}
