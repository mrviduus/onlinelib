import { useAuth } from '../context/AuthContext'

export type PaywallTrigger = 'pages' | 'words' | 'practice' | 'chapters'

interface SoftPaywallProps {
  trigger: PaywallTrigger
  onDismiss: () => void
}

const content: Record<PaywallTrigger, { icon: string; title: string; text: string }> = {
  pages: {
    icon: 'auto_stories',
    title: 'Keep reading for free',
    text: 'Sign in to unlock unlimited reading, save vocabulary, and track your progress across devices.',
  },
  words: {
    icon: 'translate',
    title: 'Save unlimited vocabulary',
    text: 'You\'ve reached the guest limit for saved words. Sign in to save unlimited vocabulary and review with spaced repetition.',
  },
  practice: {
    icon: 'school',
    title: 'Unlimited practice sessions',
    text: 'Sign in to access unlimited vocabulary review and track your learning progress.',
  },
  chapters: {
    icon: 'menu_book',
    title: 'Sign in to keep reading',
    text: 'Create a free account to unlock all chapters, save your vocabulary, and continue reading anytime.',
  },
}

export function SoftPaywall({ trigger, onDismiss }: SoftPaywallProps) {
  const { openAuthModal } = useAuth()

  const c = content[trigger]

  const handleSignIn = () => {
    openAuthModal()
    onDismiss()
  }

  return (
    <div className="soft-paywall-overlay" onClick={onDismiss}>
      <div className="soft-paywall" onClick={e => e.stopPropagation()}>
        <span className="material-icons-outlined soft-paywall__icon">{c.icon}</span>
        <h2 className="soft-paywall__title">{c.title}</h2>
        <p className="soft-paywall__text">{c.text}</p>
        <div className="soft-paywall__actions">
          <button className="soft-paywall__btn-primary" onClick={handleSignIn}>
            Continue with sign in
          </button>
          <button className="soft-paywall__btn-secondary" onClick={onDismiss}>
            Maybe later
          </button>
        </div>
      </div>
    </div>
  )
}
