interface StreakBadgeProps {
  streak: number
  progress: number // 0–1
  size?: number
}

export function StreakBadge({ streak, progress, size = 32 }: StreakBadgeProps) {
  const r = size * 0.38
  const circumference = 2 * Math.PI * r
  const offset = circumference * (1 - Math.min(1, progress))
  const cx = size / 2
  const cy = size / 2
  const strokeW = size * 0.09

  const atRisk = streak > 0 && progress === 0
  const complete = progress >= 1

  const ringColor = complete
    ? '#22c55e'
    : atRisk
      ? '#f59e0b'
      : 'var(--color-brand, #C4704B)'

  const flameOpacity = progress === 0 && streak === 0 ? 0.3 : atRisk ? 0.6 : 1
  const flameColor = complete ? 'var(--color-brand, #C4704B)' : '#94a3b8'

  // Flame path scaled to fit inside the ring
  const fs = size * 0.012 // flame scale
  const fx = cx - 8 * fs
  const fy = cy - 10 * fs

  return (
    <span className={`streak-badge${atRisk ? ' streak-badge--at-risk' : ''}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Track */}
        <circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke="var(--color-border, #e2e8f0)" strokeWidth={strokeW}
        />
        {/* Progress */}
        {progress > 0 && (
          <circle
            cx={cx} cy={cy} r={r} fill="none"
            stroke={ringColor} strokeWidth={strokeW} strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={offset}
            transform={`rotate(-90 ${cx} ${cy})`}
            className="streak-badge__ring"
          />
        )}
        {/* At-risk ring highlight */}
        {atRisk && (
          <circle
            cx={cx} cy={cy} r={r} fill="none"
            stroke={ringColor} strokeWidth={strokeW}
            className="streak-badge__ring streak-badge__pulse"
          />
        )}
        {/* Flame icon */}
        <g opacity={flameOpacity} transform={`translate(${fx}, ${fy}) scale(${fs})`}>
          <path
            d="M8 16c-2.2 0-4-1.5-4-4 0-2 1-3.5 2-5 .3-.4.7-.8 1-1.3C7.5 6.5 8 7 8 8c.8-1 1.5-2.2 2-3.5.2-.5.4-1 .5-1.5.5 1.2 1.5 2.5 2 3.5 1 1.5 1.5 3 1.5 4.5 0 2.5-1.8 5-6 5z"
            fill={complete ? ringColor : flameColor}
          />
        </g>
        {complete && (
          <circle cx={cx} cy={cy} r={r + strokeW} fill="none"
            stroke={ringColor} strokeWidth={1} opacity={0.3}
          />
        )}
      </svg>
      {streak > 0 && <span className="streak-badge__count">{streak}</span>}
    </span>
  )
}
