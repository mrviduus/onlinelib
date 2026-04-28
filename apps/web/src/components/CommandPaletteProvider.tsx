import { useEffect, useState } from 'react'
import { CommandPalette } from './CommandPalette'
import { useTrackVisitedRoute } from '../hooks/useTrackVisitedRoute'

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable) return true
  return false
}

export function CommandPaletteProvider() {
  const [open, setOpen] = useState(false)
  useTrackVisitedRoute()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key.toLowerCase() !== 'k') return
      // Allow Cmd+K to be used in the palette itself but not in regular form fields
      // unless palette is already open (cmdk handles its own shortcuts).
      if (!open && isTypingTarget(e.target)) return
      e.preventDefault()
      setOpen((v) => !v)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  return <CommandPalette open={open} onClose={() => setOpen(false)} />
}
