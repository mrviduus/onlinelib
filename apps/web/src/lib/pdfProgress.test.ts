import { describe, it, expect } from 'vitest'
import { clamp01, buildPdfProgressPayload, parsePdfPageLocator } from './pdfProgress'

describe('clamp01', () => {
  it('clamps into [0,1] and coerces non-finite to 0', () => {
    expect(clamp01(0.5)).toBe(0.5)
    expect(clamp01(-1)).toBe(0)
    expect(clamp01(2)).toBe(1)
    expect(clamp01(NaN)).toBe(0)
    expect(clamp01(Infinity)).toBe(0) // non-finite → 0 (degenerate, never a real fraction)
  })
})

describe('buildPdfProgressPayload', () => {
  const FIXED = Date.UTC(2026, 6, 10) // deterministic updatedAt

  it('builds a chapterless page:N locator + page fraction', () => {
    const p = buildPdfProgressPayload(21, 100, FIXED)
    expect(p.chapterSlug).toBeNull()
    expect(p.locator).toBe('page:21')
    expect(p.percent).toBeCloseTo(0.21)
    expect(p.updatedAt).toBe(new Date(FIXED).toISOString())
  })

  it('clamps percent to 1 on the last page and floors the page', () => {
    const p = buildPdfProgressPayload(100.9, 100, FIXED)
    expect(p.locator).toBe('page:100')
    expect(p.percent).toBe(1)
  })

  it('floors a fractional page and never goes below page 1', () => {
    expect(buildPdfProgressPayload(0, 100, FIXED).locator).toBe('page:1')
    expect(buildPdfProgressPayload(-5, 100, FIXED).locator).toBe('page:1')
  })

  it('yields percent 0 when numPages is unknown (<1)', () => {
    const p = buildPdfProgressPayload(3, 0, FIXED)
    expect(p.percent).toBe(0)
    expect(p.locator).toBe('page:3')
  })
})

describe('parsePdfPageLocator', () => {
  it('parses page:<N> to a 1-based page', () => {
    expect(parsePdfPageLocator('page:42')).toBe(42)
    expect(parsePdfPageLocator(' page:7 ')).toBe(7)
  })

  it('returns null for non-page / empty / malformed locators', () => {
    expect(parsePdfPageLocator(null)).toBeNull()
    expect(parsePdfPageLocator(undefined)).toBeNull()
    expect(parsePdfPageLocator('')).toBeNull()
    expect(parsePdfPageLocator('cfi:/6/4')).toBeNull()
    expect(parsePdfPageLocator('page:0')).toBeNull()
    expect(parsePdfPageLocator('page:abc')).toBeNull()
  })
})
