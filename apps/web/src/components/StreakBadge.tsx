interface VocabBadgeProps {
  reviewed: number
  due: number
  streak: number
  size?: number
}

export function StreakBadge({ reviewed, due, streak, size = 28 }: VocabBadgeProps) {
  const total = reviewed + due
  if (total === 0) return null

  const complete = due === 0 && reviewed > 0
  const progress = total > 0 ? reviewed / total : 0

  if (complete) {
    return (
      <span className="streak-badge">
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <path
            d="M12 2C12 2 9.5 6.5 9.5 9.5C9.5 11 10 12 10 12C10 12 8 10.5 7.5 8C5.5 10 5 12.5 5 14C5 18.4 8.6 22 13 22C17.4 22 20 18.4 20 14C20 8 12 2 12 2Z"
            fill="var(--color-text)"
          />
          <path
            d="M12.5 22C10 22 9 19.5 9 17.5C9 15.5 11 13 12.5 11.5C14 13 16 15.5 16 17.5C16 19.5 15 22 12.5 22Z"
            fill="var(--color-brand, #C4704B)"
          />
        </svg>
        {streak > 0 && <span className="streak-badge__count">{streak}</span>}
      </span>
    )
  }

  // Progress ring
  const r = size * 0.38
  const circumference = 2 * Math.PI * r
  const offset = circumference * (1 - Math.min(1, progress))
  const cx = size / 2
  const cy = size / 2
  const strokeW = size * 0.1

  return (
    <span className="streak-badge">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke="var(--color-border, #e2e8f0)" strokeWidth={strokeW}
        />
        {progress > 0 && (
          <circle
            cx={cx} cy={cy} r={r} fill="none"
            stroke="var(--color-brand, #C4704B)" strokeWidth={strokeW} strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={offset}
            transform={`rotate(-90 ${cx} ${cy})`}
            className="streak-badge__ring"
          />
        )}
        {streak > 0 && (
          <text
            x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
            fill="var(--color-text)" fontSize={size * 0.36} fontWeight="700"
            fontFamily="inherit"
          >
            {streak}
          </text>
        )}
      </svg>
    </span>
  )
}
