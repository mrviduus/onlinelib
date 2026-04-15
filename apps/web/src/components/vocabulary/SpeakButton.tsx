interface SpeakButtonProps {
  onClick: () => void
  isPlaying?: boolean
  size?: number
  className?: string
}

export function SpeakButton({ onClick, isPlaying, size = 16, className = '' }: SpeakButtonProps) {
  return (
    <button
      className={`speak-btn ${isPlaying ? 'speak-btn--playing' : ''} ${className}`}
      onMouseDown={e => e.preventDefault()}
      onClick={e => { e.stopPropagation(); onClick() }}
      title="Listen"
      aria-label="Listen to pronunciation"
      type="button"
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      </svg>
    </button>
  )
}
