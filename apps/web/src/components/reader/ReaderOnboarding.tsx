import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import '../../styles/reader-onboarding.css'

const STORAGE_KEY = 'reader.onboarding.seen'

interface ReaderOnboardingProps {
  onDismiss?: () => void
}

export function ReaderOnboarding({ onDismiss }: ReaderOnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [visible, setVisible] = useState(false)
  const { t } = useTranslation()

  const steps = [
    {
      icon: 'touch_app',
      title: t('onboarding.tapTitle') || 'Tap any word to translate',
      description: t('onboarding.tapDesc') || 'Touch a word to see its translation and save it to your vocabulary.',
    },
    {
      icon: 'auto_awesome',
      title: t('onboarding.savedTitle') || 'Words are saved automatically',
      description: t('onboarding.savedDesc') || 'Every tapped word is remembered. Review them later with spaced repetition.',
    },
  ]

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return
    const timer = setTimeout(() => setVisible(true), 800)
    return () => clearTimeout(timer)
  }, [])

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1)
    } else {
      localStorage.setItem(STORAGE_KEY, '1')
      setVisible(false)
      onDismiss?.()
    }
  }, [currentStep, steps.length, onDismiss])

  const handleDismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
    onDismiss?.()
  }, [onDismiss])

  useEffect(() => {
    if (!visible) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, handleDismiss])

  if (!visible) return null

  const step = steps[currentStep]
  const isLast = currentStep === steps.length - 1

  return (
    <div className="reader-onboarding" onClick={handleDismiss}>
      <div className="reader-onboarding__card" onClick={e => e.stopPropagation()}>
        <span className="material-icons-outlined reader-onboarding__icon">{step.icon}</span>
        <h3 className="reader-onboarding__title">{step.title}</h3>
        <p className="reader-onboarding__desc">{step.description}</p>
        <div className="reader-onboarding__actions">
          <button className="reader-onboarding__skip" onClick={handleDismiss}>
            {t('onboarding.skip') || 'Skip'}
          </button>
          <button className="reader-onboarding__next" onClick={handleNext}>
            {isLast ? (t('onboarding.gotIt') || 'Got it') : (t('onboarding.next') || 'Next')}
          </button>
        </div>
        <div className="reader-onboarding__dots">
          {steps.map((_, i) => (
            <span key={i} className={`reader-onboarding__dot ${i === currentStep ? 'reader-onboarding__dot--active' : ''}`} />
          ))}
        </div>
      </div>
    </div>
  )
}
