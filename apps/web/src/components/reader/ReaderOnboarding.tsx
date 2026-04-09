import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { useAuth } from '../../context/AuthContext'
import '../../styles/reader-onboarding.css'

const STORAGE_KEY = 'reader.onboarding.seen'
const TOTAL_STEPS = 2

const stepIcons = ['touch_app', 'auto_awesome']

export function ReaderOnboarding() {
  const { t } = useTranslation()
  const { isAuthenticated } = useAuth()
  const [currentStep, setCurrentStep] = useState(0)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (isAuthenticated) return
    if (localStorage.getItem(STORAGE_KEY)) return
    const timer = setTimeout(() => setVisible(true), 800)
    return () => clearTimeout(timer)
  }, [isAuthenticated])

  const handleNext = useCallback(() => {
    if (currentStep < TOTAL_STEPS - 1) {
      setCurrentStep(prev => prev + 1)
    } else {
      localStorage.setItem(STORAGE_KEY, '1')
      setVisible(false)
    }
  }, [currentStep])

  const handleDismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
  }, [])

  useEffect(() => {
    if (!visible) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, handleDismiss])

  if (!visible) return null

  const stepNum = currentStep + 1
  const title = t(`reader.onboarding.step${stepNum}Title`)
  const desc = t(`reader.onboarding.step${stepNum}Desc`)
  const isLast = currentStep === TOTAL_STEPS - 1

  return (
    <div className="reader-onboarding" onClick={handleDismiss}>
      <div className="reader-onboarding__card" onClick={e => e.stopPropagation()}>
        <span className="material-icons-outlined reader-onboarding__icon">{stepIcons[currentStep]}</span>
        <h3 className="reader-onboarding__title">{title}</h3>
        <p className="reader-onboarding__desc">{desc}</p>
        <div className="reader-onboarding__actions">
          <button className="reader-onboarding__skip" onClick={handleDismiss}>
            {t('reader.onboarding.skip')}
          </button>
          <button className="reader-onboarding__next" onClick={handleNext}>
            {isLast ? t('reader.onboarding.gotIt') : t('reader.onboarding.next')}
          </button>
        </div>
        <div className="reader-onboarding__dots">
          {stepIcons.map((_, i) => (
            <span key={i} className={`reader-onboarding__dot ${i === currentStep ? 'reader-onboarding__dot--active' : ''}`} />
          ))}
        </div>
      </div>
    </div>
  )
}
