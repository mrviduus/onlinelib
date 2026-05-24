import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { buildUserBookProgressPayload, parseScrollLocator } from './progressPayload'

/**
 * Property-based round-trip tests for the locator wire format.
 *
 * Why: build (write side) and parse (read side) used to live in
 * separate files with naive `split(':')` parsers. Bug-sweep pass 6
 * centralised them in `@textstack/shared`, but the round-trip
 * (parse(build(x)) === x) was only verified by hand-crafted cases.
 *
 * fast-check generates random inputs to surface asymmetries the
 * hand-crafted suite would miss — colons in slug, edge offsets,
 * Unicode in slug, etc.
 */

// Realistic slug arbitrary — allows colons and Unicode but not the
// empty string or only-whitespace (would be rejected upstream).
const arbSlug = fc.string({ minLength: 1, maxLength: 80 })
  .filter(s => s.length > 0 && !s.includes('\n') && !s.includes('\r'))

const arbValidOffset = fc.integer({ min: 0, max: 10_000_000 })

describe('parseScrollLocator ∘ buildUserBookProgressPayload — round-trip properties', () => {
  it('round-trip preserves slug + offset for any non-empty slug', () => {
    fc.assert(
      fc.property(arbSlug, arbValidOffset, (slug, offset) => {
        const payload = buildUserBookProgressPayload({
          currentChapterSlug: slug,
          fallbackChapterSlug: null,
          chapterProgress: 0,
          scrollOffset: offset,
        })
        // Builder must produce a payload (slug is non-empty by construction).
        expect(payload).not.toBeNull()
        const parsed = parseScrollLocator(payload!.locator)
        expect(parsed).not.toBeNull()
        expect(parsed!.slug).toBe(slug)
        expect(parsed!.offset).toBe(offset)
      }),
      { numRuns: 500 },
    )
  })

  it('parser rejects garbage that builder cannot have produced', () => {
    // Inverse: anything NOT matching `scroll:<non-empty>:<digits>` MUST
    // round-trip to null. Catches accidental loosening of the parser.
    fc.assert(
      fc.property(fc.string(), (garbage) => {
        // Skip the rare case where random string happens to match the
        // valid format. Test the rejection invariant for everything else.
        const looksLikeValidLocator = /^scroll:[^]+:\d+$/.test(garbage)
        if (looksLikeValidLocator) return
        const parsed = parseScrollLocator(garbage)
        // parser should return null for anything that doesn't structurally
        // match scroll:<slug>:<digits>
        if (parsed !== null) {
          // If parsed succeeded, the slug + offset must each be valid —
          // i.e., re-building from parsed values must produce the same
          // locator. This catches accidental partial-parse bugs.
          const rebuilt = buildUserBookProgressPayload({
            currentChapterSlug: parsed.slug,
            fallbackChapterSlug: null,
            chapterProgress: 0,
            scrollOffset: parsed.offset,
          })
          expect(rebuilt!.locator).toBe(garbage)
        }
      }),
      { numRuns: 500 },
    )
  })

  it('offsets above MAX_SCROLL_OFFSET clamp on build, round-trip the clamped value', () => {
    fc.assert(
      fc.property(arbSlug, fc.integer({ min: 10_000_001, max: Number.MAX_SAFE_INTEGER }), (slug, hugeOffset) => {
        const payload = buildUserBookProgressPayload({
          currentChapterSlug: slug,
          fallbackChapterSlug: null,
          chapterProgress: 0,
          scrollOffset: hugeOffset,
        })
        const parsed = parseScrollLocator(payload!.locator)
        // Clamped to 10M on build → parsed back as 10M.
        expect(parsed!.offset).toBe(10_000_000)
        expect(parsed!.slug).toBe(slug)
      }),
      { numRuns: 100 },
    )
  })

  it('fractional offsets round to integer on build, round-trip exact', () => {
    fc.assert(
      fc.property(arbSlug, fc.float({ min: Math.fround(0), max: Math.fround(1_000_000), noNaN: true }), (slug, fracOffset) => {
        const payload = buildUserBookProgressPayload({
          currentChapterSlug: slug,
          fallbackChapterSlug: null,
          chapterProgress: 0,
          scrollOffset: fracOffset,
        })
        const parsed = parseScrollLocator(payload!.locator)
        // Build rounds fractional offsets to integer; parse expects integer.
        // The round-trip yields the rounded value, not the original float.
        expect(parsed!.offset).toBe(Math.round(fracOffset))
      }),
      { numRuns: 200 },
    )
  })
})
