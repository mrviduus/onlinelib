import { useEffect } from 'react'

export function useGlobalUploadShortcut(enabled: boolean, onTrigger: () => void) {
  useEffect(() => {
    if (!enabled) return
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      if (e.key.toLowerCase() !== 'u') return
      e.preventDefault()
      onTrigger()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [enabled, onTrigger])
}
