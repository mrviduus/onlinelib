import { describe, it, expect, vi } from 'vitest'
import { createSseParser, parseAskDone, makeAskSseHandler, type SseEvent } from './sseParser'

describe('createSseParser', () => {
  function collect(chunks: string[]): SseEvent[] {
    const events: SseEvent[] = []
    const p = createSseParser(e => events.push(e))
    for (const c of chunks) p.feed(c)
    p.end()
    return events
  }

  it('parses a single event split by a blank line', () => {
    expect(collect(['event: delta\ndata: hello\n\n'])).toEqual([{ event: 'delta', data: 'hello' }])
  })

  it('joins multi-line data with newlines', () => {
    expect(collect(['data: a\ndata: b\n\n'])).toEqual([{ event: 'message', data: 'a\nb' }])
  })

  it('reassembles an event split across chunk boundaries', () => {
    expect(collect(['event: de', 'lta\ndata: wor', 'ld\n\n'])).toEqual([{ event: 'delta', data: 'world' }])
  })

  it('is CRLF-tolerant and ignores comment/keep-alive lines', () => {
    expect(collect([': keep-alive\r\nevent: done\r\ndata: {}\r\n\r\n'])).toEqual([{ event: 'done', data: '{}' }])
  })

  it('flushes a trailing event on end() with no final blank line', () => {
    expect(collect(['event: done\ndata: {"insufficient":true}'])).toEqual([
      { event: 'done', data: '{"insufficient":true}' },
    ])
  })

  it('handles the full delta*+done stream shape', () => {
    const events = collect([
      'event: delta\ndata: The \n\n',
      'event: delta\ndata: whale\n\n',
      'event: done\ndata: {"citations":[],"insufficient":false}\n\n',
    ])
    expect(events).toEqual([
      { event: 'delta', data: 'The ' },
      { event: 'delta', data: 'whale' },
      { event: 'done', data: '{"citations":[],"insufficient":false}' },
    ])
  })
})

describe('parseAskDone', () => {
  it('defaults every field on malformed JSON', () => {
    expect(parseAskDone('not json')).toEqual({ citations: [], lastReadOrd: 0, insufficient: false })
  })

  it('parses citations + insufficient + lastReadOrd', () => {
    const done = parseAskDone('{"citations":[{"marker":1}],"lastReadOrd":4,"insufficient":true}')
    expect(done.insufficient).toBe(true)
    expect(done.lastReadOrd).toBe(4)
    expect(done.citations).toHaveLength(1)
  })

  it('coerces a truthy non-boolean insufficient to a boolean', () => {
    expect(parseAskDone('{"insufficient":1}').insufficient).toBe(true)
  })
})

describe('makeAskSseHandler', () => {
  it('routes delta/done/error to the right callbacks', () => {
    const onDelta = vi.fn(); const onDone = vi.fn(); const onError = vi.fn()
    const h = makeAskSseHandler({ onDelta, onDone, onError })
    h({ event: 'delta', data: 'hi' })
    h({ event: 'done', data: '{"insufficient":true}' })
    h({ event: 'error', data: 'boom' })
    expect(onDelta).toHaveBeenCalledWith('hi')
    expect(onDone).toHaveBeenCalledWith({ citations: [], lastReadOrd: 0, insufficient: true })
    expect(onError).toHaveBeenCalledWith('boom')
  })

  it('drops events once the signal is aborted', () => {
    const onDelta = vi.fn()
    const ctrl = new AbortController()
    const h = makeAskSseHandler({ onDelta, onDone: vi.fn(), onError: vi.fn(), signal: ctrl.signal })
    ctrl.abort()
    h({ event: 'delta', data: 'late' })
    expect(onDelta).not.toHaveBeenCalled()
  })

  it('falls back to a generic message for an empty error frame', () => {
    const onError = vi.fn()
    makeAskSseHandler({ onDelta: vi.fn(), onDone: vi.fn(), onError })({ event: 'error', data: '' })
    expect(onError).toHaveBeenCalledWith('Ask failed')
  })
})
