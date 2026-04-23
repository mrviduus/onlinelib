import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { VocabHighlightErrorBoundary } from '../VocabHighlightErrorBoundary'
import { resetSink, setSink } from '../../../lib/vocabHighlightTelemetry'

function Thrower({ message = 'boom' }: { message?: string }): null {
  throw new Error(message)
}

function ConditionalThrower({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('conditional')
  return <div>child ok</div>
}

describe('VocabHighlightErrorBoundary', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // React logs caught errors to console.error — silence the noise.
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    resetSink()
  })

  afterEach(() => {
    errorSpy.mockRestore()
    resetSink()
  })

  it('renders children when no error is thrown', () => {
    render(
      <VocabHighlightErrorBoundary fallback={<span>fallback</span>}>
        <span>ok-child</span>
      </VocabHighlightErrorBoundary>,
    )
    expect(screen.getByText('ok-child')).toBeInTheDocument()
    expect(screen.queryByText('fallback')).not.toBeInTheDocument()
  })

  it('renders the fallback when a child throws', () => {
    render(
      <VocabHighlightErrorBoundary fallback={<span>fallback</span>}>
        <Thrower />
      </VocabHighlightErrorBoundary>,
    )
    expect(screen.getByText('fallback')).toBeInTheDocument()
  })

  it('emits error.boundary telemetry with the thrown message', () => {
    const sink = vi.fn()
    setSink(sink)

    render(
      <VocabHighlightErrorBoundary fallback={<span>f</span>}>
        <Thrower message="something-bad" />
      </VocabHighlightErrorBoundary>,
    )

    const call = sink.mock.calls.find((c) => c[0] === 'error.boundary')
    expect(call).toBeTruthy()
    expect(call?.[1]?.error).toBe('something-bad')
  })

  it('calls the onError callback with the thrown error', () => {
    const onError = vi.fn()
    render(
      <VocabHighlightErrorBoundary fallback={<span>f</span>} onError={onError}>
        <Thrower />
      </VocabHighlightErrorBoundary>,
    )
    expect(onError).toHaveBeenCalled()
    const err = onError.mock.calls[0][0]
    expect(err).toBeInstanceOf(Error)
  })

  it('recovers on resetKey change and re-renders the child', () => {
    function Root() {
      const [key, setKey] = useState(0)
      const [shouldThrow, setShouldThrow] = useState(true)
      useEffect(() => {
        // Simulate "new chapter": stop throwing + bump reset key.
        const t = setTimeout(() => {
          setShouldThrow(false)
          setKey(1)
        }, 0)
        return () => clearTimeout(t)
      }, [])
      return (
        <VocabHighlightErrorBoundary fallback={<span>fallback</span>} resetKey={key}>
          <ConditionalThrower shouldThrow={shouldThrow} />
        </VocabHighlightErrorBoundary>
      )
    }

    const { findByText } = render(<Root />)
    return findByText('child ok').then((el) => {
      expect(el).toBeInTheDocument()
    })
  })
})
