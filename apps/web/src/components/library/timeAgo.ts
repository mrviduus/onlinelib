// Extracted verbatim from LibraryPage.tsx (R6 slice-1). Shared by the saved &
// upload list-item cards. Behavior unchanged.
export function formatTimeAgo(dateStr: string, t: (key: string) => string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return t('library.timeJustNow')
  if (diffMins < 60) return `${diffMins} ${t('library.timeMinAgo')}`
  if (diffHours < 24) return `${diffHours} ${t('library.timeHoursAgo')}`
  if (diffDays === 1) return t('library.timeYesterday')
  if (diffDays < 7) return `${diffDays} ${t('library.timeDaysAgo')}`
  return date.toLocaleDateString()
}
