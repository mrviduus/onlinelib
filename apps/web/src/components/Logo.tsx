/**
 * TextStack brand mark.
 *
 * Single source of truth for the logo across the web app. The SVG icon
 * uses `fill="currentColor"` so the hue is driven by the parent CSS
 * `color` token (dark-mode friendly, no asset swap needed).
 *
 * `variant`:
 *   - `icon`   — just the glyph (favicons, compact badges, hero mark).
 *   - `lockup` — glyph + wordmark; the wordmark is rendered as HTML text
 *     so it inherits typography tokens and stays locale-agnostic.
 *
 * `micro`:
 *   - `undefined` (default) — auto: small sizes (≤ 32 px) use the
 *     simplified micro mark, larger sizes use the detailed mark.
 *   - `true` / `false` — force the choice.
 *
 *   The micro mark is hand-tuned on a 24×24 grid for navbar / favicon /
 *   mobile header clarity. The detailed mark lives on 256×256 with a
 *   radiating page fan — great for hero, blurry in the navbar.
 */
import type { CSSProperties } from 'react'

export type LogoVariant = 'icon' | 'lockup'

type LogoProps = {
  variant?: LogoVariant
  /** Height in px (width derived from 1:1 aspect ratio). */
  size?: number
  /** Force the simplified micro mark. Defaults to auto (micro when size ≤ 32). */
  micro?: boolean
  className?: string
  style?: CSSProperties
  'aria-label'?: string
}

export function Logo({
  variant = 'lockup',
  size = 32,
  micro,
  className,
  style,
  'aria-label': ariaLabel,
}: LogoProps) {
  const useMicro = micro ?? size <= 32

  const svg = useMicro ? (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      role="img"
      aria-hidden={variant === 'lockup' ? true : undefined}
      aria-label={variant === 'icon' ? (ariaLabel ?? 'TextStack') : undefined}
      focusable="false"
    >
      {variant === 'icon' && <title>{ariaLabel ?? 'TextStack'}</title>}
      <rect x="9" y="3" width="6" height="2" rx="1" />
      <rect x="7" y="6" width="10" height="2" rx="1" />
      <rect x="5" y="9" width="14" height="2" rx="1" />
      <path d="M3 13Q12 15 21 13L21 18Q12 20 3 18Z" />
    </svg>
  ) : (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      width={size}
      height={size}
      fill="currentColor"
      role="img"
      aria-hidden={variant === 'lockup' ? true : undefined}
      aria-label={variant === 'icon' ? (ariaLabel ?? 'TextStack') : undefined}
      focusable="false"
    >
      {variant === 'icon' && <title>{ariaLabel ?? 'TextStack'}</title>}
      <g transform="translate(0, 64)">
        <path d="M18 88C42 84.8 67 84.6 92 87.8C108 89.9 120.4 93.1 128 96.6C135.6 93.1 148 89.9 164 87.8C189 84.6 214 84.8 238 88L232 101.5C209.8 99 186.8 99.1 164.8 101.5C149.2 103.2 136.6 106 128 109.4C119.4 106 106.8 103.2 91.2 101.5C69.2 99.1 46.2 99 24 101.5L18 88Z" />
        <path d="M28 72.5C44 70.8 60.5 71.4 76.5 75C95 79.2 112 86.6 128 96.6C145.4 85.4 161.2 77.7 177.8 73.8C192.3 70.4 207.6 69.8 223 71L219.5 80.2C205.6 79.7 191.8 81 178.6 84.5C161.5 89.1 145.3 97.9 128 109C112.6 99.1 95.6 91.4 77.8 86.8C62.7 82.9 47.3 81.4 31.5 81.8L28 72.5Z" />
        <path d="M45 58C57.2 58.2 68.8 60.8 80 66.5C96.7 75 112.3 86.2 128 100C144.5 85.1 159.3 74.2 174.6 66.6C185.1 61.4 196.3 58.7 208 58.2L204.2 66.5C194.4 67.5 185 70.4 175.8 75.4C160.9 83.5 145.4 94.7 128 111C113.2 97.8 97.3 86.9 80.2 79C68.7 73.7 56.8 70.3 44.2 68.8L45 58Z" />
        <path d="M66 43.5C74.6 45.2 82.5 49.2 90 55.3C102.9 65.7 115.2 79.4 128 96.6C141.5 77.9 153.2 65.2 165.5 55.4C172.4 49.9 179.7 46.1 187.6 44L183.5 50.7C176.9 53 170.8 56.8 164.7 62C153 72 141 85.3 128 104C115.5 86.5 102.8 73.3 89 63.4C81.9 58.3 74.4 54.2 66.3 51.3L66 43.5Z" />
        <path d="M92.5 29C98.4 32.1 103.7 36.9 108.8 43.1C116.1 52 122.4 62.9 128 76.5C134.2 60.5 140.1 49.9 146.9 41.8C151 37 155.3 33.2 160 30.6L156.6 36.2C152.8 39.3 149.2 43.2 145.6 48.1C139.7 56.2 134.1 66.4 128 81C122.5 67.7 116.3 57 109 48.5C104 42.7 98.8 38.2 93.2 35L92.5 29Z" />
        <path d="M121.5 18C124 21.4 126.2 25.6 128 30.7C130 25.1 132 21.1 134.5 18.2L133.6 23.2C131.9 25.9 130.2 29.5 128.4 34.6C126.8 29.8 125 26.1 123 23.2L121.5 18Z" />
      </g>
    </svg>
  )

  if (variant === 'icon') {
    return (
      <span className={className} style={{ display: 'inline-flex', lineHeight: 0, ...style }}>
        {svg}
      </span>
    )
  }

  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4em', lineHeight: 1, ...style }}
      role="img"
      aria-label={ariaLabel ?? 'TextStack'}
    >
      {svg}
      <span className="brand-wordmark">TextStack</span>
    </span>
  )
}
