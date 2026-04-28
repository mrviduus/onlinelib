import { useCallback, useEffect, useState } from 'react'

export type SelectableItem = { id: string }

export function useLibrarySelection() {
  const [active, setActive] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const enter = useCallback(() => setActive(true), [])
  const exit = useCallback(() => { setActive(false); setSelected(new Set()) }, [])

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clear = useCallback(() => setSelected(new Set()), [])

  const selectAll = useCallback((items: SelectableItem[]) => {
    setSelected(new Set(items.map((i) => i.id)))
  }, [])

  const isSelected = useCallback((id: string) => selected.has(id), [selected])

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { exit(); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, exit])

  return { active, enter, exit, selected, toggle, clear, selectAll, isSelected, count: selected.size }
}
