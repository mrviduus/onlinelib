import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { trackOnboarding } from '../lib/onboardingAnalytics'
import type { GuestWord } from '../context/GuestLimitsContext'

const SESSION_KEY = 'onboarding.microPracticeDone'
const REGISTRATION_SESSION_KEY = 'onboarding.registrationPromptDismissed'
const ONBOARDING_SEEN_KEY = 'reader.onboarding.seen'
const WORD_HINT_TIMEOUT = 5000
const FEEDBACK_DURATION = 1500
const REGISTRATION_DELAY = 3000
const TAPS_REQUIRED = 2

const FALLBACK_DISTRACTORS = [
  'to go', 'small', 'quickly', 'beautiful', 'house',
  'йти', 'маленький', 'швидко', 'гарний', 'будинок',
]

type Phase =
  | 'idle'
  | 'word_hint'
  | 'counting_taps'
  | 'prompt_shown'
  | 'practice_active'
  | 'feedback'
  | 'post_feedback'
  | 'registration_prompt'
  | 'done'

interface OnboardingFlowOptions {
  onboardingModalDismissed: boolean
  lastTappedWord: string | null
  lastTappedTranslation: string | null
  guestSavedWords: GuestWord[]
  isAuthenticated: boolean
}

function generateDistractor(
  correctTranslation: string,
  savedWords: GuestWord[],
  currentWord: string,
): string {
  const others = savedWords.filter(
    w =>
      w.translation &&
      w.translation.toLowerCase() !== correctTranslation.toLowerCase() &&
      w.word.toLowerCase() !== currentWord.toLowerCase(),
  )
  if (others.length > 0) {
    const pick = others[Math.floor(Math.random() * others.length)]
    return pick.translation!
  }
  // Fallback: pick a random from hardcoded list that differs from correct
  const fallbacks = FALLBACK_DISTRACTORS.filter(
    d => d.toLowerCase() !== correctTranslation.toLowerCase(),
  )
  return fallbacks[Math.floor(Math.random() * fallbacks.length)] || 'something else'
}

function shuffleOptions(correct: string, distractor: string): { options: string[]; correctIndex: number } {
  if (Math.random() < 0.5) {
    return { options: [correct, distractor], correctIndex: 0 }
  }
  return { options: [distractor, correct], correctIndex: 1 }
}

export function useOnboardingFlow({
  onboardingModalDismissed,
  lastTappedWord,
  lastTappedTranslation,
  guestSavedWords,
  isAuthenticated,
}: OnboardingFlowOptions) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [feedbackState, setFeedbackState] = useState<'correct' | 'incorrect' | null>(null)
  const [practiceWord, setPracticeWord] = useState<{ word: string; translation: string } | null>(null)
  const [options, setOptions] = useState<string[]>([])
  const [correctOptionIndex, setCorrectOptionIndex] = useState(0)

  const tappedWordsRef = useRef(new Set<string>())
  const practiceWordRef = useRef<{ word: string; translation: string } | null>(null)
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const hintTimerRef = useRef<ReturnType<typeof setTimeout>>()

  // Check if flow should be skipped entirely
  const shouldSkip = useMemo(() => {
    if (sessionStorage.getItem(SESSION_KEY)) return true
    if (!localStorage.getItem(ONBOARDING_SEEN_KEY)) return false // modal hasn't been seen yet — wait
    return false
  }, [])

  // Transition: onboarding modal dismissed → show word hint
  useEffect(() => {
    if (shouldSkip || phase !== 'idle' || !onboardingModalDismissed) return
    setPhase('word_hint')
    trackOnboarding('word_hint_shown')
  }, [onboardingModalDismissed, shouldSkip, phase])

  // Word hint timeout → move to counting_taps
  useEffect(() => {
    if (phase !== 'word_hint') return
    hintTimerRef.current = setTimeout(() => {
      trackOnboarding('word_hint_timeout')
      setPhase('counting_taps')
    }, WORD_HINT_TIMEOUT)
    return () => clearTimeout(hintTimerRef.current)
  }, [phase])

  // Track word taps
  useEffect(() => {
    if (!lastTappedWord || (phase !== 'word_hint' && phase !== 'counting_taps')) return

    // First tap during word_hint → transition to counting_taps
    if (phase === 'word_hint') {
      clearTimeout(hintTimerRef.current)
      trackOnboarding('word_hint_tapped')
      setPhase('counting_taps')
    }

    tappedWordsRef.current.add(lastTappedWord.toLowerCase())

    // Store latest word+translation for practice
    if (lastTappedTranslation) {
      practiceWordRef.current = { word: lastTappedWord, translation: lastTappedTranslation }
    }

    // Check if we have enough taps
    if (
      tappedWordsRef.current.size >= TAPS_REQUIRED &&
      practiceWordRef.current
    ) {
      setPracticeWord(practiceWordRef.current)
      setPhase('prompt_shown')
      trackOnboarding('micro_prompt_shown')
    }
  }, [lastTappedWord, lastTappedTranslation, phase])

  const acceptPrompt = useCallback(() => {
    if (!practiceWord) return
    const distractor = generateDistractor(practiceWord.translation, guestSavedWords, practiceWord.word)
    const { options: opts, correctIndex } = shuffleOptions(practiceWord.translation, distractor)
    setOptions(opts)
    setCorrectOptionIndex(correctIndex)
    setPhase('practice_active')
    trackOnboarding('micro_prompt_accepted')
  }, [practiceWord, guestSavedWords])

  const dismissPrompt = useCallback(() => {
    setPhase('done')
    sessionStorage.setItem(SESSION_KEY, '1')
    trackOnboarding('micro_prompt_dismissed')
  }, [])

  const handleAnswer = useCallback((idx: number) => {
    if (phase !== 'practice_active') return
    const isCorrect = idx === correctOptionIndex
    setFeedbackState(isCorrect ? 'correct' : 'incorrect')
    setPhase('feedback')
    trackOnboarding('micro_practice_answered')
    trackOnboarding(isCorrect ? 'micro_practice_correct' : 'micro_practice_incorrect')

    feedbackTimerRef.current = setTimeout(() => {
      setFeedbackState(null)
      sessionStorage.setItem(SESSION_KEY, '1')
      setPhase('post_feedback')
    }, FEEDBACK_DURATION)
  }, [phase, correctOptionIndex])

  const dismissWordHint = useCallback(() => {
    if (phase === 'word_hint') {
      clearTimeout(hintTimerRef.current)
      setPhase('counting_taps')
    }
  }, [phase])

  // Post-feedback → registration prompt (guest only, 3s delay)
  const registrationTimerRef = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => {
    if (phase !== 'post_feedback') return
    if (isAuthenticated || sessionStorage.getItem(REGISTRATION_SESSION_KEY)) {
      setPhase('done')
      return
    }
    registrationTimerRef.current = setTimeout(() => {
      setPhase('registration_prompt')
      trackOnboarding('registration_prompt_shown')
    }, REGISTRATION_DELAY)
    return () => clearTimeout(registrationTimerRef.current)
  }, [phase, isAuthenticated])

  const acceptRegistration = useCallback(() => {
    sessionStorage.setItem(REGISTRATION_SESSION_KEY, '1')
    setPhase('done')
    trackOnboarding('registration_prompt_accepted')
  }, [])

  const dismissRegistration = useCallback(() => {
    sessionStorage.setItem(REGISTRATION_SESSION_KEY, '1')
    setPhase('done')
    trackOnboarding('registration_prompt_dismissed')
  }, [])

  // Cleanup timers
  useEffect(() => {
    return () => {
      clearTimeout(feedbackTimerRef.current)
      clearTimeout(hintTimerRef.current)
      clearTimeout(registrationTimerRef.current)
    }
  }, [])

  return {
    showWordHint: phase === 'word_hint',
    showMicroPrompt: phase === 'prompt_shown',
    showMicroPractice: phase === 'practice_active' || phase === 'feedback',
    showRegistrationPrompt: phase === 'registration_prompt',
    practiceWord,
    options,
    correctOptionIndex,
    feedbackState,
    acceptPrompt,
    dismissPrompt,
    handleAnswer,
    dismissWordHint,
    acceptRegistration,
    dismissRegistration,
  }
}
