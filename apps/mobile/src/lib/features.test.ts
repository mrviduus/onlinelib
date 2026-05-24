import { describe, it, expect, beforeEach } from 'vitest'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  FEATURES,
  READER_OVERLAY_V2_STORAGE_KEY,
  resolveReaderOverlayV2Active,
  readReaderOverlayV2Active,
} from './features'

// The mock exposes __reset for clean state between tests.
const MockedStorage = AsyncStorage as unknown as { __reset(): void }

describe('FEATURES — build-time defaults', () => {
  it('readerOverlayV2 defaults to true (matches shipped behavior)', () => {
    expect(FEATURES.readerOverlayV2).toBe(true)
  })
})

describe('resolveReaderOverlayV2Active (pure)', () => {
  it('"0" → false (kill-switch override)', () => {
    expect(resolveReaderOverlayV2Active('0')).toBe(false)
  })

  it('"1" → true (force-on override)', () => {
    expect(resolveReaderOverlayV2Active('1')).toBe(true)
  })

  it('null → build-time default', () => {
    expect(resolveReaderOverlayV2Active(null)).toBe(FEATURES.readerOverlayV2)
  })

  it('unrecognized value → build-time default', () => {
    expect(resolveReaderOverlayV2Active('maybe')).toBe(FEATURES.readerOverlayV2)
    expect(resolveReaderOverlayV2Active('')).toBe(FEATURES.readerOverlayV2)
    expect(resolveReaderOverlayV2Active('true')).toBe(FEATURES.readerOverlayV2) // strict check
  })
})

describe('readReaderOverlayV2Active (AsyncStorage-backed)', () => {
  beforeEach(() => MockedStorage.__reset())

  it('returns default when storage empty', async () => {
    expect(await readReaderOverlayV2Active()).toBe(FEATURES.readerOverlayV2)
  })

  it('honors "0" override', async () => {
    await AsyncStorage.setItem(READER_OVERLAY_V2_STORAGE_KEY, '0')
    expect(await readReaderOverlayV2Active()).toBe(false)
  })

  it('honors "1" override', async () => {
    await AsyncStorage.setItem(READER_OVERLAY_V2_STORAGE_KEY, '1')
    expect(await readReaderOverlayV2Active()).toBe(true)
  })

  it('falls back to default on unrecognized stored value', async () => {
    await AsyncStorage.setItem(READER_OVERLAY_V2_STORAGE_KEY, 'corrupt')
    expect(await readReaderOverlayV2Active()).toBe(FEATURES.readerOverlayV2)
  })
})
