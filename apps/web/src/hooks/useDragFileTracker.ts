import { useEffect, useRef, useState } from 'react'

export interface DragFileTrackerOptions {
  enabled: boolean
  onDrop: (files: File[]) => void
}

export function useDragFileTracker({ enabled, onDrop }: DragFileTrackerOptions) {
  const [isDragging, setIsDragging] = useState(false)
  const depthRef = useRef(0)
  const onDropRef = useRef(onDrop)
  onDropRef.current = onDrop

  useEffect(() => {
    if (!enabled) return

    const isFileDrag = (e: DragEvent): boolean => {
      const types = e.dataTransfer?.types
      if (!types) return false
      for (let i = 0; i < types.length; i++) if (types[i] === 'Files') return true
      return false
    }

    const onEnter = (e: DragEvent) => {
      if (!isFileDrag(e)) return
      depthRef.current += 1
      if (depthRef.current === 1) setIsDragging(true)
    }
    const onOver = (e: DragEvent) => {
      if (!isFileDrag(e)) return
      e.preventDefault()
    }
    const onLeave = (e: DragEvent) => {
      if (!isFileDrag(e)) return
      depthRef.current = Math.max(0, depthRef.current - 1)
      if (depthRef.current === 0) setIsDragging(false)
    }
    const onDropEvt = (e: DragEvent) => {
      if (!isFileDrag(e)) return
      e.preventDefault()
      depthRef.current = 0
      setIsDragging(false)
      const dt = e.dataTransfer
      if (!dt) return
      const files: File[] = []
      for (let i = 0; i < dt.files.length; i++) files.push(dt.files[i])
      if (files.length > 0) onDropRef.current(files)
    }

    document.addEventListener('dragenter', onEnter)
    document.addEventListener('dragover', onOver)
    document.addEventListener('dragleave', onLeave)
    document.addEventListener('drop', onDropEvt)
    return () => {
      document.removeEventListener('dragenter', onEnter)
      document.removeEventListener('dragover', onOver)
      document.removeEventListener('dragleave', onLeave)
      document.removeEventListener('drop', onDropEvt)
      depthRef.current = 0
    }
  }, [enabled])

  return { isDragging }
}
