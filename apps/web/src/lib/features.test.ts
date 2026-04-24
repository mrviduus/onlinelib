import { describe, it, expect, afterEach } from 'vitest'
import {
  isRuntimeKillswitchSet,
  isReaderOverlayKillswitchSet,
  isReaderOverlayRuntimeEnabled,
  isReaderOverlayStorageKillswitchSet,
  isReaderOverlayV2Active,
} from './features'

type WinFlags = {
  __textstackDisableCustomHighlights?: boolean
  __textstackForceLegacyReader?: boolean
  __textstackForceOverlayReader?: boolean
}

function clearAllFlags() {
  const w = window as unknown as WinFlags
  delete w.__textstackDisableCustomHighlights
  delete w.__textstackForceLegacyReader
  delete w.__textstackForceOverlayReader
  try {
    window.localStorage.removeItem('textstack.readerOverlayV2')
  } catch {
    // ignore
  }
}

describe('isRuntimeKillswitchSet', () => {
  afterEach(clearAllFlags)

  it('returns false when the window flag is unset', () => {
    expect(isRuntimeKillswitchSet()).toBe(false)
  })

  it('returns true when the window flag is true', () => {
    ;(window as unknown as WinFlags).__textstackDisableCustomHighlights = true
    expect(isRuntimeKillswitchSet()).toBe(true)
  })

  it('returns false when the flag is falsy (e.g. undefined, 0, false)', () => {
    ;(window as unknown as WinFlags).__textstackDisableCustomHighlights = false
    expect(isRuntimeKillswitchSet()).toBe(false)
  })
})

describe('isReaderOverlayKillswitchSet', () => {
  afterEach(clearAllFlags)

  it('returns false when the window flag is unset', () => {
    expect(isReaderOverlayKillswitchSet()).toBe(false)
  })

  it('returns true when the window flag is true', () => {
    ;(window as unknown as WinFlags).__textstackForceLegacyReader = true
    expect(isReaderOverlayKillswitchSet()).toBe(true)
  })
})

describe('isReaderOverlayRuntimeEnabled', () => {
  afterEach(clearAllFlags)

  it('returns false when nothing is set', () => {
    expect(isReaderOverlayRuntimeEnabled()).toBe(false)
  })

  it('returns true when window override is set', () => {
    ;(window as unknown as WinFlags).__textstackForceOverlayReader = true
    expect(isReaderOverlayRuntimeEnabled()).toBe(true)
  })

  it('returns true when localStorage flag is "1"', () => {
    window.localStorage.setItem('textstack.readerOverlayV2', '1')
    expect(isReaderOverlayRuntimeEnabled()).toBe(true)
  })

  it('returns false when localStorage flag is any other value', () => {
    window.localStorage.setItem('textstack.readerOverlayV2', '0')
    expect(isReaderOverlayRuntimeEnabled()).toBe(false)
    window.localStorage.setItem('textstack.readerOverlayV2', 'true')
    expect(isReaderOverlayRuntimeEnabled()).toBe(false)
  })
})

describe('isReaderOverlayStorageKillswitchSet', () => {
  afterEach(clearAllFlags)

  it('returns false when storage is empty', () => {
    expect(isReaderOverlayStorageKillswitchSet()).toBe(false)
  })

  it('returns true when storage is "0"', () => {
    window.localStorage.setItem('textstack.readerOverlayV2', '0')
    expect(isReaderOverlayStorageKillswitchSet()).toBe(true)
  })

  it('returns false when storage is "1" (opt-in, not killswitch)', () => {
    window.localStorage.setItem('textstack.readerOverlayV2', '1')
    expect(isReaderOverlayStorageKillswitchSet()).toBe(false)
  })
})

describe('isReaderOverlayV2Active', () => {
  afterEach(clearAllFlags)

  it('returns true by default (build flag on post-flip)', () => {
    expect(isReaderOverlayV2Active()).toBe(true)
  })

  it('returns true when runtime opt-in is set via localStorage', () => {
    window.localStorage.setItem('textstack.readerOverlayV2', '1')
    expect(isReaderOverlayV2Active()).toBe(true)
  })

  it('returns true when window override is set', () => {
    ;(window as unknown as WinFlags).__textstackForceOverlayReader = true
    expect(isReaderOverlayV2Active()).toBe(true)
  })

  it('killswitch wins over runtime opt-in', () => {
    window.localStorage.setItem('textstack.readerOverlayV2', '1')
    ;(window as unknown as WinFlags).__textstackForceLegacyReader = true
    expect(isReaderOverlayV2Active()).toBe(false)
  })

  it('killswitch wins over window override', () => {
    ;(window as unknown as WinFlags).__textstackForceOverlayReader = true
    ;(window as unknown as WinFlags).__textstackForceLegacyReader = true
    expect(isReaderOverlayV2Active()).toBe(false)
  })

  it('storage killswitch ("0") disables even when window override is set', () => {
    window.localStorage.setItem('textstack.readerOverlayV2', '0')
    ;(window as unknown as WinFlags).__textstackForceOverlayReader = true
    expect(isReaderOverlayV2Active()).toBe(false)
  })
})
