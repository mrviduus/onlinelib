import type { ReactNode } from 'react'

interface Props {
  title: string
  coverImageSrc?: string | null
  coverImageAlt?: string
  coverImageTitle?: string
  coverPlaceholderText?: string
  coverPlaceholderBg?: string
  authorContent?: ReactNode
  descriptionHeading?: string
  descriptionText?: string
  metaContent?: ReactNode
  actionsContent?: ReactNode
}

export function BookDetailHero({
  title,
  coverImageSrc,
  coverImageAlt,
  coverImageTitle,
  coverPlaceholderText,
  coverPlaceholderBg,
  authorContent,
  descriptionHeading,
  descriptionText,
  metaContent,
  actionsContent,
}: Props) {
  return (
    <section className="book-hero">
      <div className="book-hero__cover-wrapper">
        <div
          className="book-hero__cover"
          style={{ backgroundColor: coverImageSrc ? undefined : coverPlaceholderBg }}
        >
          {coverImageSrc ? (
            <img src={coverImageSrc} alt={coverImageAlt || title} title={coverImageTitle} />
          ) : (
            <span className="book-hero__cover-text">{coverPlaceholderText || title?.[0] || '?'}</span>
          )}
        </div>
        <div className="book-hero__cover-border" />
      </div>

      <div className="book-hero__info">
        <h1 className="book-hero__title">{title}</h1>

        {authorContent && <p className="book-hero__author">{authorContent}</p>}

        {descriptionText && (
          <div className="book-hero__about">
            {descriptionHeading && <h2 className="book-hero__about-title">{descriptionHeading}</h2>}
            <p className="book-hero__about-text">{descriptionText}</p>
          </div>
        )}

        {metaContent && <div className="book-hero__meta">{metaContent}</div>}

        {actionsContent && <div className="book-hero__actions">{actionsContent}</div>}
      </div>
    </section>
  )
}
