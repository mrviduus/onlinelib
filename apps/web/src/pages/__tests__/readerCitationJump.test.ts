import { describe, it, expect } from 'vitest'
import { resolveCitationJump } from '../readerCitationJump'

describe('resolveCitationJump', () => {
  it('routes a page-anchored citation to the PDF viewer in Original mode', () => {
    const jump = resolveCitationJump({ sourcePage: 12 }, true)
    expect(jump).toEqual({ kind: 'pdf', page: 12 })
  })

  it('falls through to reflow when not in Original mode even with a sourcePage', () => {
    expect(resolveCitationJump({ sourcePage: 12 }, false)).toEqual({ kind: 'reflow' })
  })

  it('falls through to reflow for a chapter-anchored citation (no sourcePage) in Original mode', () => {
    expect(resolveCitationJump({ sourcePage: null }, true)).toEqual({ kind: 'reflow' })
    expect(resolveCitationJump({}, true)).toEqual({ kind: 'reflow' })
  })

  it('routes page 1 (falsy-but-valid) to the PDF viewer', () => {
    expect(resolveCitationJump({ sourcePage: 1 }, true)).toEqual({ kind: 'pdf', page: 1 })
  })
})
