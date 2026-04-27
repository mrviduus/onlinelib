interface GeneratedCoverProps {
  title: string
  author?: string | null
  className?: string
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h)
  return Math.abs(h)
}

export function GeneratedCover({ title, author, className }: GeneratedCoverProps) {
  const seed = hash(`${title}|${author ?? ''}`)
  const hue = seed % 360
  const hue2 = (hue + 40) % 360
  const initial = (title?.trim()?.[0] ?? '?').toUpperCase()
  const style = {
    background: `linear-gradient(135deg, hsl(${hue}, 55%, 55%) 0%, hsl(${hue2}, 60%, 35%) 100%)`,
  }
  return (
    <div
      className={`generated-cover${className ? ` ${className}` : ''}`}
      style={style}
      role="img"
      aria-label={title}
    >
      <span className="generated-cover__initial">{initial}</span>
    </div>
  )
}
