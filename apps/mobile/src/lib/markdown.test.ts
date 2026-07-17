import { describe, it, expect } from 'vitest'
import { isTableSeparator } from './markdown'

describe('isTableSeparator', () => {
  it('matches a pipe-delimited dash separator', () => {
    expect(isTableSeparator('|---|---|')).toBe(true)
    expect(isTableSeparator('| --- | --- |')).toBe(true)
  })

  it('matches alignment colons', () => {
    expect(isTableSeparator('|:--|:-:|--:|')).toBe(true)
  })

  it('tolerates a leading/trailing pipe being omitted', () => {
    expect(isTableSeparator('--- | ---')).toBe(true)
  })

  it('rejects a bare thematic break (no pipe)', () => {
    expect(isTableSeparator('---')).toBe(false)
    expect(isTableSeparator('  ----  ')).toBe(false)
  })

  it('rejects a pipe row with no dash (a header/data row)', () => {
    expect(isTableSeparator('| a | b |')).toBe(false)
  })

  it('rejects prose that merely contains a pipe and a dash', () => {
    expect(isTableSeparator('a | b - c')).toBe(false)
  })
})
