import { describe, it, expect, beforeEach } from 'vitest'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  DEFAULT_REVIEW_MODE,
  isReviewMode,
  reviewModeFromParam,
  loadReviewMode,
  saveReviewMode,
} from './reviewMode'

/**
 * The regression under test is #558: `?reviewMode=blitz` started a Flashcards
 * session, every time. The screen wiring that caused it is not testable here
 * (vitest collects `src/lib/**` only), so the rule was moved out of the screen
 * — and the case that must never regress is the first one below: a param that
 * says `blitz` resolves to `blitz`, with no hook state anywhere in the answer.
 */
describe('reviewModeFromParam', () => {
  const cases: [label: string, raw: unknown, expected: string][] = [
    // The bug. Before the fix the session always ran 'classic' regardless.
    ['blitz', 'blitz', 'blitz'],
    ['classic', 'classic', 'classic'],
    ['undefined (no param — Practice tapped with no mode)', undefined, 'classic'],
    ['null', null, 'classic'],
    ['empty string', '', 'classic'],
    ['garbage', 'not-a-mode', 'classic'],
    ['wrong case', 'Blitz', 'classic'],
    ['uppercase', 'BLITZ', 'classic'],
    ['whitespace-padded', ' blitz ', 'classic'],
    // expo-router hands back string[] for a repeated param (?reviewMode=a&reviewMode=b).
    ['string array', ['blitz'], 'classic'],
    ['number', 1, 'classic'],
    ['object', { mode: 'blitz' }, 'classic'],
  ]

  for (const [label, raw, expected] of cases) {
    it(`${label} → ${expected}`, () => {
      expect(reviewModeFromParam(raw)).toBe(expected)
    })
  }

  it('never throws, whatever it is handed', () => {
    for (const raw of [Symbol('x'), NaN, () => {}, [], {}]) {
      expect(() => reviewModeFromParam(raw)).not.toThrow()
    }
  })

  it('default matches the hook default so an absent param changes nothing', () => {
    expect(DEFAULT_REVIEW_MODE).toBe('classic')
    expect(reviewModeFromParam(undefined)).toBe(DEFAULT_REVIEW_MODE)
  })
})

describe('isReviewMode', () => {
  it('accepts exactly the two literals', () => {
    expect(isReviewMode('blitz')).toBe(true)
    expect(isReviewMode('classic')).toBe(true)
    expect(isReviewMode('typed_recall')).toBe(false)
    expect(isReviewMode(undefined)).toBe(false)
  })
})

describe('persistence', () => {
  beforeEach(() => {
    ;(AsyncStorage as unknown as { __reset(): void }).__reset()
  })

  it('a cold start with nothing stored gets the default', async () => {
    await expect(loadReviewMode()).resolves.toBe('classic')
  })

  it('round-trips blitz — the cold-start case that used to revert', async () => {
    await saveReviewMode('blitz')
    await expect(loadReviewMode()).resolves.toBe('blitz')
  })

  it('a corrupted stored value falls back instead of propagating', async () => {
    await AsyncStorage.setItem('vocab.reviewMode.v1', '{"mode":"blitz"}')
    await expect(loadReviewMode()).resolves.toBe('classic')
  })
})
