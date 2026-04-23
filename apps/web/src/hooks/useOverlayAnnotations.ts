import { useEffect } from 'react'
import type { DrawFn, DrawOptions, Overlayer } from '../lib/readerOverlay'

// Reconcile annotation list into an Overlayer. On each render:
//   - add every item whose key is missing,
//   - remove every key in the overlayer (under this namespace) not in items.
//
// Namespace prefix keeps layers independent: user highlights, vocab, tts,
// search all share one SVG but never stomp each other.

export interface AnnotationSpec<T> {
  item: T
  key: string
  range: Range | null
  options?: DrawOptions
}

export interface UseOverlayAnnotationsOptions<T> {
  /** Unique namespace per layer, e.g. 'user-hl' or 'vocab'. */
  namespace: string
  /** Items to render. */
  items: readonly T[]
  /** Draw function from Overlayer.* palette (or a custom one). */
  draw: DrawFn
  /** Called once per item to produce key+range+options. */
  map: (item: T) => AnnotationSpec<T> | null
  /** Optional killswitch. */
  enabled?: boolean
}

export function useOverlayAnnotations<T>(
  overlayer: Overlayer | null,
  {
    namespace,
    items,
    draw,
    map,
    enabled = true,
  }: UseOverlayAnnotationsOptions<T>,
): void {
  useEffect(() => {
    if (!enabled || !overlayer) return

    const prefix = `${namespace}:`
    const desired = new Map<string, AnnotationSpec<T>>()
    for (const item of items) {
      const spec = map(item)
      if (!spec || !spec.range) continue
      desired.set(`${prefix}${spec.key}`, spec)
    }

    // Remove keys in our namespace that are no longer desired.
    for (const key of Array.from(overlayer.keys())) {
      if (!key.startsWith(prefix)) continue
      if (!desired.has(key)) overlayer.remove(key)
    }

    // Add/refresh desired keys.
    for (const [fullKey, spec] of desired) {
      overlayer.add(fullKey, spec.range!, draw, spec.options)
    }

    return () => {
      // On unmount or re-run, remove our namespace so stale entries don't
      // linger if the overlayer is shared with other layers.
      if (!overlayer) return
      for (const key of Array.from(overlayer.keys())) {
        if (key.startsWith(prefix)) overlayer.remove(key)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayer, namespace, items, draw, map, enabled])
}
