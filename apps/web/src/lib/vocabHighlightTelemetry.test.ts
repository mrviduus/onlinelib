import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { count, setSink, resetSink, type TelemetryEvent } from './vocabHighlightTelemetry'

describe('vocabHighlightTelemetry', () => {
  beforeEach(() => resetSink())
  afterEach(() => {
    resetSink()
    vi.restoreAllMocks()
  })

  it('routes events to the custom sink with payload', () => {
    const sink = vi.fn()
    setSink(sink)
    count('boot.supported', { ua: 'test' })
    expect(sink).toHaveBeenCalledWith('boot.supported', { ua: 'test' })
  })

  it('calls the sink with undefined payload when not provided', () => {
    const sink = vi.fn()
    setSink(sink)
    count('mutation.recover')
    expect(sink).toHaveBeenCalledWith('mutation.recover', undefined)
  })

  it('swallows sink errors so callers never throw', () => {
    setSink(() => {
      throw new Error('sink failure')
    })
    expect(() => count('register.error', { reason: 'x' })).not.toThrow()
  })

  it('resetSink restores the default console sink', () => {
    const custom = vi.fn()
    setSink(custom)
    resetSink()
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    count('boot.supported')
    expect(custom).not.toHaveBeenCalled()
    expect(debugSpy).toHaveBeenCalled()
  })

  it('default sink warns on error-class events and diffs', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const cases: TelemetryEvent[] = [
      'error.boundary',
      'error.engine',
      'oracle.diff',
      'register.mismatch',
    ]
    for (const ev of cases) count(ev)
    expect(warn).toHaveBeenCalledTimes(cases.length)
    expect(debug).not.toHaveBeenCalled()
  })

  it('default sink uses console.log fallback when console.debug is missing', () => {
    const original = console.debug
    // @ts-expect-error — intentionally break console.debug for test
    console.debug = undefined
    try {
      // Should not throw even when the default sink tries to call debug.
      expect(() => count('boot.supported')).not.toThrow()
    } finally {
      console.debug = original
    }
  })
})
