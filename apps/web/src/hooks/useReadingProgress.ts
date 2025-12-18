import { useState, useEffect, useCallback, useRef } from 'react'

interface StoredProgress {
  chapterSlug: string
  scrollPercent: number
  updatedAt: number
}

function getKey(bookSlug: string) {
  return `reader.progress.${bookSlug}`
}

export function useReadingProgress(bookSlug: string, chapterSlug: string) {
  const [scrollPercent, setScrollPercent] = useState(0)
  const throttleRef = useRef<number | null>(null)

  // Load saved progress on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(getKey(bookSlug))
      if (stored) {
        const data: StoredProgress = JSON.parse(stored)
        if (data.chapterSlug === chapterSlug && data.scrollPercent > 0) {
          // Restore scroll position after content loads
          requestAnimationFrame(() => {
            const maxScroll = document.documentElement.scrollHeight - window.innerHeight
            window.scrollTo(0, maxScroll * data.scrollPercent)
          })
        }
      }
    } catch {}
  }, [bookSlug, chapterSlug])

  // Track scroll and save
  useEffect(() => {
    const handleScroll = () => {
      if (throttleRef.current) return

      throttleRef.current = window.setTimeout(() => {
        throttleRef.current = null
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight
        const percent = maxScroll > 0 ? window.scrollY / maxScroll : 0
        setScrollPercent(percent)

        // Save to localStorage
        const data: StoredProgress = {
          chapterSlug,
          scrollPercent: percent,
          updatedAt: Date.now(),
        }
        localStorage.setItem(getKey(bookSlug), JSON.stringify(data))
      }, 300)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (throttleRef.current) clearTimeout(throttleRef.current)
    }
  }, [bookSlug, chapterSlug])

  const getLastPosition = useCallback((): StoredProgress | null => {
    try {
      const stored = localStorage.getItem(getKey(bookSlug))
      if (stored) return JSON.parse(stored)
    } catch {}
    return null
  }, [bookSlug])

  return { scrollPercent, getLastPosition }
}
