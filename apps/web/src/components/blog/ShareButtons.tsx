import { useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'

interface Props {
  url: string
  title: string
}

export function ShareButtons({ url, title }: Props) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const encodedUrl = encodeURIComponent(url)
  const encodedTitle = encodeURIComponent(title)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  const handleNativeShare = async () => {
    try {
      await navigator.share({ title, url })
    } catch {}
  }

  return (
    <div className="blog-share">
      <a
        className="blog-share__btn"
        href={`https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`}
        target="_blank"
        rel="noopener noreferrer"
        title={`${t('blog.shareOn')} X`}
      >
        X
      </a>
      <a
        className="blog-share__btn"
        href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        title={`${t('blog.shareOn')} Facebook`}
      >
        f
      </a>
      <a
        className="blog-share__btn"
        href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        title={`${t('blog.shareOn')} LinkedIn`}
      >
        in
      </a>
      <button
        className={`blog-share__btn ${copied ? 'blog-share__btn--copied' : ''}`}
        onClick={handleCopy}
        title={copied ? t('blog.linkCopied') : t('blog.copyLink')}
      >
        <span className="material-icons-outlined">{copied ? 'check' : 'link'}</span>
      </button>
      {'share' in navigator && (
        <button
          className="blog-share__btn"
          onClick={handleNativeShare}
          title={t('blog.share')}
        >
          <span className="material-icons-outlined">share</span>
        </button>
      )}
    </div>
  )
}
