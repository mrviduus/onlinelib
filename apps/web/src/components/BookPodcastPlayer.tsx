import { useEffect, useMemo, useRef, useState } from 'react'

interface BookPodcastPlayerProps {
  src: string
  title: string
  coverUrl?: string | null
  /** Server-reported length; used as a fallback until the media metadata loads. */
  durationSeconds?: number | null
}

const SPEEDS = [1, 1.25, 1.5, 1.75, 2] as const

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Custom, on-brand audio player for a book's AI-narrated intro — replaces the raw
 * browser <audio controls>. Native <input type="range"> drives the seek bar so it
 * stays keyboard- and screen-reader-accessible; everything else is styled to match
 * the reading app (terracotta accent, serif eyebrow, dark-mode via theme vars).
 */
export function BookPodcastPlayer({ src, title, coverUrl, durationSeconds }: BookPodcastPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(durationSeconds && durationSeconds > 0 ? durationSeconds : 0)
  const [buffered, setBuffered] = useState(0)
  const [speedIdx, setSpeedIdx] = useState(0)
  const [ready, setReady] = useState(false)

  // Reset when the source changes (e.g. navigating between books).
  useEffect(() => {
    setPlaying(false); setCurrent(0); setBuffered(0); setSpeedIdx(0); setReady(false)
    setDuration(durationSeconds && durationSeconds > 0 ? durationSeconds : 0)
  }, [src, durationSeconds])

  const speed = SPEEDS[speedIdx]
  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = speed }, [speed])

  const toggle = () => {
    const a = audioRef.current
    if (!a) return
    if (a.paused) { void a.play() } else { a.pause() }
  }

  const skip = (delta: number) => {
    const a = audioRef.current
    if (!a) return
    a.currentTime = Math.min(Math.max(0, a.currentTime + delta), duration || a.duration || 0)
  }

  const onSeek = (value: number) => {
    const a = audioRef.current
    if (!a) return
    a.currentTime = value
    setCurrent(value)
  }

  const progress = duration > 0 ? (current / duration) * 100 : 0
  const bufferedPct = duration > 0 ? Math.min(100, (buffered / duration) * 100) : 0

  const cover = useMemo(() => coverUrl || null, [coverUrl])

  return (
    <section className="podcast-player" aria-label={`Audio intro for ${title}`}>
      <div className="podcast-player__media" aria-hidden="true">
        {cover
          ? <img className="podcast-player__cover" src={cover} alt="" loading="lazy" />
          : <div className="podcast-player__cover podcast-player__cover--blank" />}
        <span className="podcast-player__badge">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 14v-2a9 9 0 0 1 18 0v2" /><rect x="2.5" y="13.5" width="4" height="7" rx="2" /><rect x="17.5" y="13.5" width="4" height="7" rx="2" />
          </svg>
        </span>
      </div>

      <div className="podcast-player__body">
        <div className="podcast-player__head">
          <p className="podcast-player__eyebrow">Audio intro · 2 voices</p>
          <h3 className="podcast-player__title" title={title}>{title}</h3>
          <p className="podcast-player__note">AI-narrated · ~{fmt(duration)}</p>
        </div>

        <div className="podcast-player__transport">
          <button type="button" className="podcast-player__skip" onClick={() => skip(-15)} aria-label="Back 15 seconds">
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 17a5 5 0 1 0-5-5" /><polyline points="6 9 6 12 9 12" />
            </svg>
            <span className="podcast-player__skip-n">15</span>
          </button>

          <button
            type="button"
            className={`podcast-player__play${playing ? ' is-playing' : ''}`}
            onClick={toggle}
            aria-label={playing ? 'Pause' : 'Play'}
            aria-pressed={playing}
          >
            {playing
              ? <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
              : <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 8 5.5Z" /></svg>}
          </button>

          <button type="button" className="podcast-player__skip" onClick={() => skip(15)} aria-label="Forward 15 seconds">
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 17a5 5 0 1 1 5-5" /><polyline points="18 9 18 12 15 12" />
            </svg>
            <span className="podcast-player__skip-n">15</span>
          </button>

          <div className="podcast-player__scrub">
            <div className="podcast-player__rail" style={{ ['--buffered' as string]: `${bufferedPct}%`, ['--progress' as string]: `${progress}%` }}>
              <input
                className="podcast-player__range"
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={current}
                onChange={(e) => onSeek(Number(e.target.value))}
                aria-label="Seek"
                aria-valuetext={`${fmt(current)} of ${fmt(duration)}`}
                disabled={!ready && duration === 0}
              />
            </div>
            <time className="podcast-player__time">{fmt(current)} <span>/</span> {fmt(duration)}</time>
          </div>

          <button
            type="button"
            className="podcast-player__speed"
            onClick={() => setSpeedIdx((i) => (i + 1) % SPEEDS.length)}
            aria-label={`Playback speed ${speed}×`}
          >
            {speed}×
          </button>

          <a className="podcast-player__download" href={src} download aria-label="Download audio">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </a>
        </div>
      </div>

      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d) && d > 0) setDuration(d); setReady(true) }}
        onCanPlay={() => setReady(true)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onProgress={(e) => {
          const a = e.currentTarget
          if (a.buffered.length) setBuffered(a.buffered.end(a.buffered.length - 1))
        }}
      />
    </section>
  )
}
