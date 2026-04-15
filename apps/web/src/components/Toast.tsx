import { useEffect, useState } from 'react'
import './Toast.css'

interface ToastProps {
  message: string
  duration?: number
  onClose: () => void
  /** Optional click handler on the toast body. Fires only while the toast is visible
   *  (not during fade-out or after auto-dismiss) so a mistimed click can't trigger
   *  an action the user never saw. */
  onClick?: () => void
}

export function Toast({ message, duration = 3000, onClose, onClick }: ToastProps) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // Trigger fade-in
    requestAnimationFrame(() => setIsVisible(true))

    const timer = setTimeout(() => {
      setIsVisible(false)
      setTimeout(onClose, 300) // Wait for fade-out
    }, duration)

    return () => clearTimeout(timer)
  }, [duration, onClose])

  const handleClick = onClick && isVisible ? () => { onClick() } : undefined

  return (
    <div
      className={`toast ${isVisible ? 'toast--visible' : ''}`}
      onClick={handleClick}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      {message}
    </div>
  )
}
