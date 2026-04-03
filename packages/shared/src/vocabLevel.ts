export interface VocabLevel {
  level: number
  label: string
  masteredCount: number
  nextThreshold: number | null
}

const THRESHOLDS = [0, 1, 10, 50, 200, 500] as const

export function getVocabLevel(masteredCount: number): VocabLevel {
  let level = 0
  for (let i = THRESHOLDS.length - 1; i >= 0; i--) {
    if (masteredCount >= THRESHOLDS[i]) {
      level = i
      break
    }
  }
  const nextThreshold = level < THRESHOLDS.length - 1 ? THRESHOLDS[level + 1] : null
  return { level, label: `Lv.${level}`, masteredCount, nextThreshold }
}
