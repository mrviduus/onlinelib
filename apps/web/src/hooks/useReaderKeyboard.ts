import { useEffect, useCallback } from 'react'

interface UseReaderKeyboardOptions {
  tocOpen: boolean
  settingsOpen: boolean
  searchOpen: boolean
  setTocOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  setSearchOpen: (open: boolean) => void
  clearSearch: () => void
}

// Desktop conventions only: Esc closes drawers, Cmd/Ctrl+F opens in-book search.
// Reading navigation is handled by the native scroll — no page-turn shortcuts.
export function useReaderKeyboard({
  tocOpen,
  settingsOpen,
  searchOpen,
  setTocOpen,
  setSettingsOpen,
  setSearchOpen,
  clearSearch,
}: UseReaderKeyboardOptions) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const inInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement

    if (e.key === 'Escape') {
      if (searchOpen) {
        setSearchOpen(false)
        clearSearch()
        e.preventDefault()
      } else if (tocOpen) {
        setTocOpen(false)
        e.preventDefault()
      } else if (settingsOpen) {
        setSettingsOpen(false)
        e.preventDefault()
      }
      return
    }

    if (inInput) return

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
      setSearchOpen(true)
      e.preventDefault()
    }
  }, [tocOpen, settingsOpen, searchOpen, setTocOpen, setSettingsOpen, setSearchOpen, clearSearch])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
