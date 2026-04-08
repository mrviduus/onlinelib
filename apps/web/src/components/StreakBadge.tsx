export const DAILY_GOAL = 10

interface VocabBadgeProps {
  reviewed: number
  due: number
  streak: number
  size?: number
}

export function StreakBadge({ reviewed, due, streak, size = 32 }: VocabBadgeProps) {
  const total = reviewed + due
  if (total === 0) return null

  const goalMet = reviewed >= DAILY_GOAL
  const progress = Math.min(reviewed, DAILY_GOAL) / DAILY_GOAL

  const r = size * 0.36
  const circumference = 2 * Math.PI * r
  const offset = circumference * (1 - progress)
  const cx = size / 2
  const cy = size / 2
  const strokeW = 3

  const ringColor = goalMet ? '#22c55e' : '#f59e0b'
  const trackColor = 'rgba(128,128,128,0.3)'

  return (
    <span className="streak-badge" data-testid="streak-badge">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Track */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColor} strokeWidth={strokeW} />
        {/* Progress arc */}
        {progress > 0 && (
          <circle
            cx={cx} cy={cy} r={r} fill="none"
            stroke={ringColor} strokeWidth={strokeW} strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={offset}
            transform={`rotate(-90 ${cx} ${cy})`}
            className="streak-badge__ring"
          />
        )}
        {/* Center content */}
        {streak > 0 ? (
          // Flame
          <g transform={`translate(${cx - 6}, ${cy - 7.5}) scale(0.5)`}>
            <path
              d="M12 2C12 2 9.5 6.5 9.5 9.5C9.5 11 10 12 10 12C10 12 8 10.5 7.5 8C5.5 10 5 12.5 5 14C5 18.4 8.6 22 13 22C17.4 22 20 18.4 20 14C20 8 12 2 12 2Z"
              fill={goalMet ? '#22c55e' : '#f59e0b'}
            />
            <path
              d="M12.5 22C10 22 9 19.5 9 17.5C9 15.5 11 13 12.5 11.5C14 13 16 15.5 16 17.5C16 19.5 15 22 12.5 22Z"
              fill={goalMet ? '#16a34a' : '#d97706'}
            />
          </g>
        ) : (
          // Due count
          <text
            x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
            fill="var(--color-text)" fontSize={size * 0.35} fontWeight="700"
            fontFamily="inherit"
          >
            {due}
          </text>
        )}
      </svg>
      {streak > 0 && <span className="streak-badge__count">{streak}</span>}
    </span>
  )
}
