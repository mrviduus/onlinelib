/**
 * Check if user input matches the expected word within a fuzzy tolerance.
 * Uses Levenshtein distance: allow 1 for words <=6 chars, 2 for 7+ chars.
 */
export function fuzzyMatch(input: string, expected: string): { match: boolean; exact: boolean } {
  const a = input.trim().toLowerCase()
  const b = expected.trim().toLowerCase()

  if (a === b) return { match: true, exact: true }

  const maxDistance = b.length <= 6 ? 1 : 2
  const dist = levenshtein(a, b)

  return { match: dist <= maxDistance, exact: false }
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length

  // Quick bounds check
  if (Math.abs(m - n) > 2) return Math.abs(m - n)

  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,     // deletion
        dp[i][j - 1] + 1,     // insertion
        dp[i - 1][j - 1] + cost // substitution
      )
    }
  }

  return dp[m][n]
}
