import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { useTranslation } from '../../hooks/useTranslation'

interface Props {
  src: string
  alt?: string
  onClose: () => void
}

const MIN_SCALE = 1
const MAX_SCALE = 6
const ZOOM_STEP = 0.25
const WHEEL_SENSITIVITY = 0.0015

export function ImageLightbox({ src, alt, onClose }: Props) {
  const { t } = useTranslation()
  const trapRef = useFocusTrap(true)
  const [scale, setScale] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)
  const dragRef = useRef<{ startX: number; startY: number; startTx: number; startTy: number } | null>(null)

  const reset = useCallback(() => {
    setScale(1)
    setTx(0)
    setTy(0)
  }, [])

  const zoomBy = useCallback((delta: number) => {
    setScale((s) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s + delta))
      if (next <= MIN_SCALE) {
        setTx(0)
        setTy(0)
      }
      return next
    })
  }, [])

  // Prevent body scroll while open. Pattern from Search.tsx:347.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        zoomBy(ZOOM_STEP)
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault()
        zoomBy(-ZOOM_STEP)
      } else if (e.key === '0') {
        e.preventDefault()
        reset()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose, zoomBy, reset])

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault()
      zoomBy(-e.deltaY * WHEEL_SENSITIVITY * 5)
    },
    [zoomBy],
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLImageElement>) => {
      if (scale <= MIN_SCALE) return
      ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
      dragRef.current = { startX: e.clientX, startY: e.clientY, startTx: tx, startTy: ty }
    },
    [scale, tx, ty],
  )

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLImageElement>) => {
    const d = dragRef.current
    if (!d) return
    setTx(d.startTx + (e.clientX - d.startX))
    setTy(d.startTy + (e.clientY - d.startY))
  }, [])

  const handlePointerUp = useCallback(() => {
    dragRef.current = null
  }, [])

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose()
    },
    [onClose],
  )

  const handleImgDoubleClick = useCallback(() => {
    if (scale > MIN_SCALE) reset()
    else setScale(2.5)
  }, [scale, reset])

  return createPortal(
    <div
      ref={trapRef}
      className="image-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={alt || t('reader.image.close')}
      onClick={handleBackdropClick}
      onWheel={handleWheel}
    >
      <img
        className="image-lightbox__img"
        src={src}
        alt={alt || ''}
        draggable={false}
        style={{
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          cursor: scale > MIN_SCALE ? (dragRef.current ? 'grabbing' : 'grab') : 'zoom-in',
        }}
        onDoubleClick={handleImgDoubleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />

      <div className="image-lightbox__controls" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="image-lightbox__btn"
          onClick={() => zoomBy(-ZOOM_STEP)}
          aria-label={t('reader.image.zoomOut')}
          disabled={scale <= MIN_SCALE}
        >
          −
        </button>
        <button
          type="button"
          className="image-lightbox__btn image-lightbox__btn--reset"
          onClick={reset}
          aria-label={t('reader.image.reset')}
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          type="button"
          className="image-lightbox__btn"
          onClick={() => zoomBy(ZOOM_STEP)}
          aria-label={t('reader.image.zoomIn')}
          disabled={scale >= MAX_SCALE}
        >
          +
        </button>
      </div>

      <button
        type="button"
        className="image-lightbox__close"
        onClick={onClose}
        aria-label={t('reader.image.close')}
      >
        ×
      </button>
    </div>,
    document.body,
  )
}
