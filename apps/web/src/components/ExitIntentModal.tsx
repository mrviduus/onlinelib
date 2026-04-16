import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTranslation } from '../hooks/useTranslation'
import { trackExitIntent } from '../lib/analytics'
import '../styles/exit-intent.css'

/**
 * ExitIntentModal — single-shot conversion lightbox for guests.
 *
 * Triggers (whichever fires first):
 *   - mouseleave from top of viewport (desktop, classic exit intent)
 *   - scroll past 70% of page (mobile-safe fallback)
 *   - 45 seconds of engaged time on site (minimum dwell)
 *
 * Gating:
 *   - only shown to non-authenticated users
 *   - never shown on auth pages (reset-password) or while AuthModal is open
 *   - suppressed for the rest of the browser session after dismiss/convert
 *     (sessionStorage, so it comes back the next visit)
 *
 * Analytics:
 *   - exit_intent_shown  (once, with trigger source)
 *   - exit_intent_converted (primary CTA → opens AuthModal)
 *   - exit_intent_dismissed (secondary CTA, overlay, or Esc)
 *
 * Variant name lets us A/B in GA4 without redeploying copy.
 */

const SESSION_KEY = 'exitIntent.dismissed'
const DWELL_MS = 45_000
const SCROLL_THRESHOLD = 0.7
const VARIANT = 'dont-lose-place-v1'

type TriggerSource = 'mouseleave' | 'scroll' | 'time'

function shouldSuppressOnRoute(pathname: string): boolean {
  // Reader pages have their own focus-mode UX — don't interrupt reading.
  if (/\/books\/[^/]+\/[^/]+$/.test(pathname)) return true
  if (/\/library\/my\/[^/]+\/(read|focus)\//.test(pathname)) return true
  if (/\/reset-password/.test(pathname)) return true
  return false
}

export function ExitIntentModal() {
  const { isAuthenticated, showAuthModal, openAuthModal } = useAuth()
  const { t } = useTranslation()
  const location = useLocation()

  const [open, setOpen] = useState(false)
  const shownRef = useRef(false)
  const triggerRef = useRef<TriggerSource | null>(null)

  const suppressed = shouldSuppressOnRoute(location.pathname)

  useEffect(() => {
    if (isAuthenticated || suppressed || shownRef.current) return
    if (typeof window === 'undefined') return
    if (sessionStorage.getItem(SESSION_KEY) === '1') return

    const show = (trigger: TriggerSource) => {
      if (shownRef.current) return
      shownRef.current = true
      triggerRef.current = trigger
      setOpen(true)
      trackExitIntent('shown', { variant: VARIANT, trigger })
    }

    const onMouseLeave = (e: MouseEvent) => {
      // Only the top edge — leaving to browser chrome / close button.
      if (e.clientY <= 0) show('mouseleave')
    }

    const onScroll = () => {
      const doc = document.documentElement
      const scrollable = doc.scrollHeight - window.innerHeight
      if (scrollable <= 0) return
      const ratio = window.scrollY / scrollable
      if (ratio >= SCROLL_THRESHOLD) show('scroll')
    }

    const timer = window.setTimeout(() => show('time'), DWELL_MS)

    document.addEventListener('mouseleave', onMouseLeave)
    window.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      document.removeEventListener('mouseleave', onMouseLeave)
      window.removeEventListener('scroll', onScroll)
      window.clearTimeout(timer)
    }
  }, [isAuthenticated, suppressed])

  // Close on Esc.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss('esc')
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // AuthModal taking over → hide exit intent (don't stack dialogs).
  useEffect(() => {
    if (showAuthModal && open) setOpen(false)
  }, [showAuthModal, open])

  const dismiss = (_reason: 'overlay' | 'button' | 'esc') => {
    setOpen(false)
    sessionStorage.setItem(SESSION_KEY, '1')
    trackExitIntent('dismissed', {
      variant: VARIANT,
      trigger: triggerRef.current ?? 'time',
    })
  }

  const convert = () => {
    setOpen(false)
    sessionStorage.setItem(SESSION_KEY, '1')
    trackExitIntent('converted', {
      variant: VARIANT,
      trigger: triggerRef.current ?? 'time',
    })
    openAuthModal()
  }

  if (!open) return null

  return (
    <div
      className="exit-intent__overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="exit-intent-heading"
      onClick={() => dismiss('overlay')}
    >
      <div className="exit-intent__card" onClick={e => e.stopPropagation()}>
        <button
          type="button"
          className="exit-intent__close"
          aria-label={t('exitIntent.secondaryCta')}
          onClick={() => dismiss('button')}
        >
          &times;
        </button>
        <h2 id="exit-intent-heading" className="exit-intent__heading">
          {t('exitIntent.heading')}
        </h2>
        <p className="exit-intent__subheading">{t('exitIntent.subheading')}</p>
        <ul className="exit-intent__benefits">
          <li>{t('exitIntent.benefit1')}</li>
          <li>{t('exitIntent.benefit2')}</li>
          <li>{t('exitIntent.benefit3')}</li>
        </ul>
        <button type="button" className="exit-intent__cta" onClick={convert}>
          {t('exitIntent.primaryCta')}
        </button>
        <p className="exit-intent__footnote">{t('exitIntent.footnote')}</p>
        <button
          type="button"
          className="exit-intent__secondary"
          onClick={() => dismiss('button')}
        >
          {t('exitIntent.secondaryCta')}
        </button>
      </div>
    </div>
  )
}
