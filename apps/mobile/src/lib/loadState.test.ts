import { describe, it, expect } from 'vitest'
import { resolveLoadView, isFailureEmpty } from './loadState'

describe('resolveLoadView', () => {
  it('shows content while loading and when ready', () => {
    expect(resolveLoadView({ status: 'loading', hasData: false })).toBe('content')
    expect(resolveLoadView({ status: 'ready', hasData: true })).toBe('content')
  })

  it('keeps the data and adds a banner when a failure still has something to show', () => {
    // Library falls back to downloaded books. Throwing them away to render an
    // error would be a worse answer than the caveat.
    expect(resolveLoadView({ status: 'offline', hasData: true })).toBe('banner')
    expect(resolveLoadView({ status: 'failed', hasData: true })).toBe('banner')
  })

  it('gives the whole screen to the message when there is nothing to show', () => {
    expect(resolveLoadView({ status: 'offline', hasData: false })).toBe('empty')
    expect(resolveLoadView({ status: 'failed', hasData: false })).toBe('empty')
  })
})

describe('isFailureEmpty', () => {
  it('separates "you have nothing yet" from "I could not ask"', () => {
    // The distinction eight screens could not make. `list.length === 0` was the
    // whole condition, so a reader whose twelve books had not arrived got the
    // screen written to welcome someone who has none — indistinguishable from
    // losing the account.
    expect(isFailureEmpty('offline', false)).toBe(true)
    expect(isFailureEmpty('failed', false)).toBe(true)
    expect(isFailureEmpty('ready', false)).toBe(false)
  })

  it('is false whenever there is data, however it arrived', () => {
    expect(isFailureEmpty('offline', true)).toBe(false)
  })

  it('is false while still loading, so a spinner never becomes an error', () => {
    expect(isFailureEmpty('loading', false)).toBe(false)
  })
})
