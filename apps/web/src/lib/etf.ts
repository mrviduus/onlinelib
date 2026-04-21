const DEFAULT_WPM = 250
// Clamp stored WPM to a sane adult-reader band. Below 100 WPM is almost
// certainly idle time polluting sessions (100 words in 10 hours ≈ 0.16 WPM →
// absurd ETF). Above 600 is skimming, not reading. Outside the band: fall
// back to DEFAULT_WPM instead of trusting the bogus sample.
const MIN_VALID_WPM = 100
const MAX_VALID_WPM = 600

export interface EtfResult {
  minutesLeft: number
  hoursLeft: number
  formatted: string
}

export function calculateETF(
  totalWords: number,
  currentProgress: number,
  userWpm: number | null,
): EtfResult | null {
  if (totalWords <= 0 || currentProgress >= 1) return null

  const wpm = userWpm && userWpm >= MIN_VALID_WPM && userWpm <= MAX_VALID_WPM
    ? userWpm
    : DEFAULT_WPM
  const remainingWords = totalWords * (1 - currentProgress)
  const minutesLeft = Math.round(remainingWords / wpm)

  if (minutesLeft <= 0) return null

  return {
    minutesLeft,
    hoursLeft: minutesLeft / 60,
    formatted: formatEtf(minutesLeft),
  }
}

/** Alias — same logic, just clearer name at call site */
export const calculateChapterETF = calculateETF

function formatEtf(minutes: number): string {
  if (minutes < 1) return '<1m'
  if (minutes < 60) return `~${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (m === 0) return `~${h}h`
  return `~${h}h ${m}m`
}
