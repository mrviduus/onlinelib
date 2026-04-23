import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { ReaderErrorBoundary } from '../ReaderErrorBoundary'
import { resetSink, setSink } from '../../../lib/vocabHighlightTelemetry'

function Thrower({ message = 'boom' }: { message?: string }): null {
  throw new Error(message)
}

function ConditionalThrower({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('conditional')
  return <div>child ok</div>
}

describe('ReaderErrorBoundary', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    resetSink()
  })

  afterEach(() => {
    errorSpy.mockRestore()
    resetSink()
  })

  it('renders children when no error is thrown', () => {
    render(
      <ReaderErrorBoundary fallback={<span>legacy-fallback</span>}>
        <span>overlay-child</span>
      </ReaderErrorBoundary>,
    )
    expect(screen.getByText('overlay-child')).toBeInTheDocument()
    expect(screen.queryByText('legacy-fallback')).not.toBeInTheDocument()
  })

  it('renders the fallback when a child throws', () => {
    render(
      <ReaderErrorBoundary fallback={<span>legacy-fallback</span>}>
        <Thrower />
      </ReaderErrorBoundary>,
    )
    expect(screen.getByText('legacy-fallback')).toBeInTheDocument()
  })

  it('emits reader.overlay.error telemetry with the thrown message', () => {
    const sink = vi.fn()
    setSink(sink)

    render(
      <ReaderErrorBoundary fallback={<span>f</span>}>
        <Thrower message="section-crash" />
      </ReaderErrorBoundary>,
    )

    const call = sink.mock.calls.find((c) => c[0] === 'reader.overlay.error')
    expect(call).toBeTruthy()
    expect(call?.[1]?.error).toBe('section-crash')
  })

  it('calls the onError callback with the thrown error', () => {
    const onError = vi.fn()
    render(
      <ReaderErrorBoundary fallback={<span>f</span>} onError={onError}>
        <Thrower />
      </ReaderErrorBoundary>,
    )
    expect(onError).toHaveBeenCalled()
    const err = onError.mock.calls[0][0]
    expect(err).toBeInstanceOf(Error)
  })

  it('recovers on resetKey change (e.g. chapter change) and re-renders child', () => {
    function Root() {
      const [key, setKey] = useState(0)
      const [shouldThrow, setShouldThrow] = useState(true)
      useEffect(() => {
        const t = setTimeout(() => {
          setShouldThrow(false)
          setKey(1)
        }, 0)
        return () => clearTimeout(t)
      }, [])
      return (
        <ReaderErrorBoundary fallback={<span>legacy-fallback</span>} resetKey={key}>
          <ConditionalThrower shouldThrow={shouldThrow} />
        </ReaderErrorBoundary>
      )
    }

    const { findByText } = render(<Root />)
    return findByText('child ok').then((el) => {
      expect(el).toBeInTheDocument()
    })
  })
})
