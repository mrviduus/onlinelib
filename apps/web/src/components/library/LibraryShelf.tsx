import { useEffect, useRef } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { LocalizedLink } from '../LocalizedLink'
import { getStorageUrl } from '../../api/client'
import { getUserBookCoverUrl } from '../../api/userBooks'
import type { LibraryShelfItem } from '../../api/library'
import { emit as emitV3 } from '../../lib/telemetry/myBooksV3'

interface LibraryShelfProps {
  shelfId: 'continueReading' | 'recentlyAdded' | 'quickReads' | 'finishedThisMonth'
  title: string
  subtitle?: string
  items: LibraryShelfItem[]
  viewAllHref?: string
}

function itemHref(it: LibraryShelfItem): string {
  if (it.type === 'userbook') return `/library/my/${it.id}`
  return `/books/${it.slug ?? ''}`
}

function itemCover(it: LibraryShelfItem): string | undefined {
  if (!it.coverPath) return undefined
  return it.type === 'userbook'
    ? getUserBookCoverUrl(it.coverPath)
    : getStorageUrl(it.coverPath)
}

export function LibraryShelf({ shelfId, title, subtitle, items, viewAllHref }: LibraryShelfProps) {
  const { t } = useTranslation()
  const trackRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      if (el.scrollWidth <= el.clientWidth) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [items.length])

  useEffect(() => {
    if (items.length > 0) emitV3('library.shelf.view', { shelf: shelfId, count: items.length })
  }, [shelfId, items.length])

  if (items.length === 0) return null

  const scrollBy = (delta: number) => {
    trackRef.current?.scrollBy({ left: delta, behavior: 'smooth' })
  }

  return (
    <section className="library-shelf continue-shelf" aria-label={title}>
      <div className="continue-shelf__head">
        <div>
          <h2 className="continue-shelf__title">{title}</h2>
          {subtitle && <div className="library-shelf__subtitle">{subtitle}</div>}
        </div>
        <div className="continue-shelf__nav">
          <button
            type="button"
            className="continue-shelf__nav-btn"
            aria-label={t('library.continueShelf.scrollLeft')}
            onClick={() => scrollBy(-320)}
          >
            <span className="material-icons-outlined">chevron_left</span>
          </button>
          <button
            type="button"
            className="continue-shelf__nav-btn"
            aria-label={t('library.continueShelf.scrollRight')}
            onClick={() => scrollBy(320)}
          >
            <span className="material-icons-outlined">chevron_right</span>
          </button>
        </div>
      </div>
      <div className="continue-shelf__track" ref={trackRef}>
        {items.map((it) => {
          const cover = itemCover(it)
          const percent = Math.round(it.progressPercent * 100)
          const showProgress = it.progressPercent > 0 && it.progressPercent < 1
          const minutes = it.estimatedMinutesRemaining
          return (
            <LocalizedLink
              key={`${it.type}-${it.id}`}
              to={itemHref(it)}
              className="continue-shelf__card"
              onClick={() => emitV3('library.shelf.click', { shelf: shelfId, type: it.type })}
            >
              <div className="continue-shelf__cover-wrap">
                {cover ? (
                  <img src={cover} alt="" className="continue-shelf__cover" loading="lazy" />
                ) : (
                  <div className="continue-shelf__cover-placeholder">📖</div>
                )}
                {showProgress && (
                  <div className="continue-shelf__progress" aria-hidden="true">
                    <div className="continue-shelf__progress-fill" style={{ width: `${percent}%` }} />
                  </div>
                )}
              </div>
              <div className="continue-shelf__meta">
                <div className="continue-shelf__name" title={it.title}>{it.title}</div>
                {it.author && <div className="continue-shelf__author">{it.author}</div>}
                {showProgress && <div className="continue-shelf__percent">{percent}%</div>}
                {!showProgress && minutes != null && minutes > 0 && (
                  <div className="continue-shelf__percent">{minutes} min</div>
                )}
              </div>
            </LocalizedLink>
          )
        })}
        {viewAllHref && (
          <LocalizedLink
            to={viewAllHref}
            className="library-shelf__view-all"
            onClick={() => emitV3('library.shelf.viewAll', { shelf: shelfId })}
          >
            {t('library.shelves.viewAll')} →
          </LocalizedLink>
        )}
      </div>
    </section>
  )
}
