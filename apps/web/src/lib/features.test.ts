import { describe, it, expect, afterEach } from 'vitest'
import { isRuntimeKillswitchSet } from './features'

describe('isRuntimeKillswitchSet', () => {
  afterEach(() => {
    delete (window as unknown as { __textstackDisableCustomHighlights?: boolean })
      .__textstackDisableCustomHighlights
  })

  it('returns false when the window flag is unset', () => {
    expect(isRuntimeKillswitchSet()).toBe(false)
  })

  it('returns true when the window flag is true', () => {
    ;(window as unknown as { __textstackDisableCustomHighlights?: boolean })
      .__textstackDisableCustomHighlights = true
    expect(isRuntimeKillswitchSet()).toBe(true)
  })

  it('returns false when the flag is falsy (e.g. undefined, 0, false)', () => {
    ;(window as unknown as { __textstackDisableCustomHighlights?: boolean })
      .__textstackDisableCustomHighlights = false
    expect(isRuntimeKillswitchSet()).toBe(false)
  })
})
