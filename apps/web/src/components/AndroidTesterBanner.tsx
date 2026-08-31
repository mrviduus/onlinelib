import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from '../hooks/useTranslation'
import '../styles/android-tester-banner.css'

const STORAGE_KEY = 'androidTesterBanner'
const READ_KEY = 'androidTesterBanner.hasRead'
const COOKIE_KEY = 'cookieConsent'

export const OPT_IN_URL = 'https://play.google.com/apps/testing/app.textstack.mobile'

/**
 * Reader routes: /:lang/books/:book/:chapter and /:lang/library/my/:id/read[/:chapter].
 * The trailing slash is not optional in production — nginx 301s chapter URLs to it — so a
 * pattern anchored on the bare segment matches locally and never matches on the live site.
 */
const READER_PATH = /\/books\/[^/]+\/[^/]+\/?$|\/library\/my\/[^/]+\/read/

function isAndroid() {
  return /Android/i.test(navigator.userAgent)
}

/**
 * Invites Android readers into the closed test. Deliberately narrow: it waits until
 * someone has actually opened a book, because a tester who never reads is worth
 * nothing to us and counts against us with Google.
 */
export function AndroidTesterBanner() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const [visible, setVisible] = useState(false)

  const inReader = READER_PATH.test(pathname)

  // Remember that this visitor reads, so the banner can wait for the second visit.
  useEffect(() => {
    if (inReader) localStorage.setItem(READ_KEY, '1')
  }, [inReader])

  useEffect(() => {
    if (inReader) {
      setVisible(false)
      return
    }
    if (!isAndroid()) return
    if (localStorage.getItem(STORAGE_KEY)) return
    // One banner at a time — the cookie bar owns the bottom of the screen until answered.
    if (!localStorage.getItem(COOKIE_KEY)) return
    if (!localStorage.getItem(READ_KEY)) return
    setVisible(true)
  }, [inReader, pathname])

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'dismissed')
    setVisible(false)
  }

  const join = () => {
    localStorage.setItem(STORAGE_KEY, 'joined')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="android-tester" role="dialog" aria-labelledby="android-tester-title">
      <div className="android-tester__inner">
        <div className="android-tester__text">
          <strong id="android-tester-title">{t('androidBeta.title')}</strong>
          <p>{t('androidBeta.body')}</p>
        </div>
        <div className="android-tester__actions">
          <button type="button" className="android-tester__btn android-tester__btn--secondary" onClick={dismiss}>
            {t('androidBeta.dismiss')}
          </button>
          <a
            className="android-tester__btn android-tester__btn--primary"
            href={OPT_IN_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={join}
          >
            {t('androidBeta.join')}
          </a>
        </div>
      </div>
    </div>
  )
}
