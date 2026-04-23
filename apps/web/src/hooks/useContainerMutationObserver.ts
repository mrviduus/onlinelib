import { useEffect } from 'react'

export interface ContainerMutationObserverOptions {
  attributes?: boolean
  // Default observe config covers the cases we care about: innerHTML
  // replacement (childList+subtree) and direct text edits (characterData).
}

// Observe DOM mutations inside a container ref. Callback is RAF-debounced
// so a burst of mutations (e.g. entire innerHTML replace) only fires one
// re-compute. Disconnects on unmount / container change.
//
// Pattern lifted from HighlightLayer.tsx — it's the proven recovery path
// after ReaderContent's dangerouslySetInnerHTML wipes our overlay.
export function useContainerMutationObserver(
  containerRef: React.RefObject<HTMLElement | null>,
  onMutate: () => void,
  options: ContainerMutationObserverOptions = {},
): void {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let rafId: number | null = null
    const schedule = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        try {
          onMutate()
        } catch {
          // Callback must not crash the observer lifecycle.
        }
      })
    }

    const observer = new MutationObserver(schedule)
    observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: options.attributes ?? false,
    })

    return () => {
      observer.disconnect()
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
    }
  }, [containerRef, onMutate, options.attributes])
}
