import { useState } from 'react'
import { useTranslation } from '../hooks/useTranslation'
import './ShareButtons.css'

interface ShareButtonsProps {
  url: string
  title: string
  subtitle?: string
  linkOnly?: boolean
  className?: string
}

export function ShareButtons({ url, title, subtitle, linkOnly, className }: ShareButtonsProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const encodedUrl = encodeURIComponent(url)
  const encodedTitle = encodeURIComponent(title)

  const handleCopy = async () => {
    const text = subtitle ? `${title} — ${subtitle}\n${url}` : url
    try {
      await navigator.clipboard.writeText(text)
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
    <div className={`share-buttons${className ? ` ${className}` : ''}`}>
      {!linkOnly && (
        <>
          <a
            className="share-buttons__btn"
            href={`https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`}
            target="_blank"
            rel="noopener noreferrer"
            title={`${t('share.shareOn')} X`}
          >
            X
          </a>
          <a
            className="share-buttons__btn"
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
            target="_blank"
            rel="noopener noreferrer"
            title={`${t('share.shareOn')} Facebook`}
          >
            f
          </a>
          <a
            className="share-buttons__btn"
            href={`https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`}
            target="_blank"
            rel="noopener noreferrer"
            title={`${t('share.shareOn')} Telegram`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
            </svg>
          </a>
          <a
            className="share-buttons__btn"
            href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`}
            target="_blank"
            rel="noopener noreferrer"
            title={`${t('share.shareOn')} LinkedIn`}
          >
            in
          </a>
        </>
      )}
      <button
        className={`share-buttons__btn${copied ? ' share-buttons__btn--copied' : ''}`}
        onClick={handleCopy}
        title={copied ? t('share.linkCopied') : t('share.copyLink')}
      >
        <span className="material-icons-outlined">{copied ? 'check' : 'link'}</span>
      </button>
      {'share' in navigator && (
        <button
          className="share-buttons__btn"
          onClick={handleNativeShare}
          title={t('share.share')}
        >
          <span className="material-icons-outlined">share</span>
        </button>
      )}
    </div>
  )
}
