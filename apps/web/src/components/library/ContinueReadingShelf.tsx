import { useRef } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { useContinueReadingList, type ContinueItem } from '../../hooks/useContinueReadingList'
import { LocalizedLink } from '../LocalizedLink'
import { getStorageUrl } from '../../api/client'
import { getUserBookCoverUrl } from '../../api/userBooks'

function itemKey(it: ContinueItem): string {
  return it.kind === 'edition' ? `e-${it.item.editionId}` : `u-${it.book.id}`
}

function itemTitle(it: ContinueItem): string {
  return it.kind === 'edition' ? it.item.title : it.book.title
}

function itemAuthor(it: ContinueItem): string | null {
  return it.kind === 'edition' ? null : it.book.author
}

function itemCover(it: ContinueItem): string | undefined {
  return it.kind === 'edition'
    ? getStorageUrl(it.item.coverPath)
    : getUserBookCoverUrl(it.book.coverPath)
}

function itemHref(it: ContinueItem): string {
  if (it.kind === 'edition') {
    const slug = it.progress.chapterSlug ?? ''
    return `/books/${it.item.slug}/${slug}`
  }
  const ch = it.book.progressChapterSlug ?? ''
  return `/library/my/${it.book.id}/read/${ch}`
}

export function ContinueReadingShelf() {
  const { t } = useTranslation()
  const { items, loading } = useContinueReadingList(5)
  const trackRef = useRef<HTMLDivElement | null>(null)

  if (loading || items.length === 0) return null

  const scrollBy = (delta: number) => {
    trackRef.current?.scrollBy({ left: delta, behavior: 'smooth' })
  }

  return (
    <section className="continue-shelf" aria-label={t('library.continueShelf.title')}>
      <div className="continue-shelf__head">
        <h2 className="continue-shelf__title">{t('library.continueShelf.title')}</h2>
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
        {items.map((it, idx) => {
          const cover = itemCover(it)
          const author = itemAuthor(it)
          const title = itemTitle(it)
          const percent = Math.round(it.percent * 100)
          const isFirst = idx === 0
          return (
            <LocalizedLink
              key={itemKey(it)}
              to={itemHref(it)}
              className={`continue-shelf__card${isFirst ? ' continue-shelf__card--first' : ''}`}
            >
              <div className="continue-shelf__cover-wrap">
                {cover ? (
                  <img src={cover} alt="" className="continue-shelf__cover" loading="lazy" />
                ) : (
                  <div className="continue-shelf__cover-placeholder">📖</div>
                )}
                {isFirst && (
                  <span className="continue-shelf__badge">{t('library.continueShelf.badge')}</span>
                )}
                <div className="continue-shelf__progress" aria-hidden="true">
                  <div className="continue-shelf__progress-fill" style={{ width: `${percent}%` }} />
                </div>
              </div>
              <div className="continue-shelf__meta">
                <div className="continue-shelf__name" title={title}>{title}</div>
                {author && <div className="continue-shelf__author">{author}</div>}
                <div className="continue-shelf__percent">{percent}%</div>
              </div>
            </LocalizedLink>
          )
        })}
      </div>
    </section>
  )
}
