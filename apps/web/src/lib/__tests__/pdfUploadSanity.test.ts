import { describe, it, expect } from 'vitest'
import { looksLikeCompletePdf, pdfFilePassesSanityCheck } from '../pdfUploadSanity'

function bytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

describe('looksLikeCompletePdf', () => {
  it('valid header + full trailer → true', () => {
    const header = bytes('%PDF-1.7\n...')
    const tail = bytes('...\nstartxref\n1234\n%%EOF\n')
    expect(looksLikeCompletePdf(header, tail)).toBe(true)
  })

  it('missing trailer (truncated) → false', () => {
    const header = bytes('%PDF-1.4 some content')
    const tail = bytes('a stream of bytes that got cut off mid-object')
    expect(looksLikeCompletePdf(header, tail)).toBe(false)
  })

  it('junk-prefixed header still detected → true', () => {
    const header = bytes('\x00\x01junk preamble %PDF-1.5 rest')
    const tail = bytes('startxref 42 %%EOF')
    expect(looksLikeCompletePdf(header, tail)).toBe(true)
  })

  it('%%EOF without startxref → false', () => {
    const header = bytes('%PDF-1.6')
    const tail = bytes('binary...\n%%EOF\n')
    expect(looksLikeCompletePdf(header, tail)).toBe(false)
  })

  it('startxref without %%EOF → false', () => {
    const header = bytes('%PDF-1.6')
    const tail = bytes('startxref\n999\n') // download cut before %%EOF
    expect(looksLikeCompletePdf(header, tail)).toBe(false)
  })

  it('non-pdf header → false', () => {
    const header = bytes('PK\x03\x04 this is a zip/epub')
    const tail = bytes('startxref %%EOF')
    expect(looksLikeCompletePdf(header, tail)).toBe(false)
  })

  it('empty header or tail → false', () => {
    expect(looksLikeCompletePdf(new Uint8Array(0), bytes('startxref %%EOF'))).toBe(false)
    expect(looksLikeCompletePdf(bytes('%PDF-'), new Uint8Array(0))).toBe(false)
    expect(looksLikeCompletePdf(new Uint8Array(0), new Uint8Array(0))).toBe(false)
  })

  it('binary bytes around markers → true (raw byte search, not utf-8)', () => {
    const header = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0xff, 0xfe, 0x00]) // %PDF- + binary
    const tail = bytes('\xff\x00startxref\n5\n%%EOF\xff')
    expect(looksLikeCompletePdf(header, tail)).toBe(true)
  })
})

// Minimal File-like stub: real jsdom File supports slice + arrayBuffer, but we
// stub to keep control over head/tail bytes and name/type.
function makeFile(name: string, head: Uint8Array, tail: Uint8Array, type = ''): File {
  return {
    name,
    type,
    slice(start?: number) {
      const isTail = typeof start === 'number' && start < 0
      const chunk = isTail ? tail : head
      return {
        arrayBuffer: async () => chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength),
      } as Blob
    },
  } as unknown as File
}

describe('pdfFilePassesSanityCheck', () => {
  it('epub skips the check → true', async () => {
    const f = makeFile('book.epub', bytes('PK\x03\x04'), bytes('junk'))
    expect(await pdfFilePassesSanityCheck(f)).toBe(true)
  })

  it('complete pdf → true', async () => {
    const f = makeFile('book.pdf', bytes('%PDF-1.7'), bytes('startxref 10 %%EOF'))
    expect(await pdfFilePassesSanityCheck(f)).toBe(true)
  })

  it('truncated pdf → false', async () => {
    const f = makeFile('book.pdf', bytes('%PDF-1.7'), bytes('...cut off...'))
    expect(await pdfFilePassesSanityCheck(f)).toBe(false)
  })

  it('detects pdf by mime type when name has no extension → false for truncated', async () => {
    const f = makeFile('download', bytes('%PDF-1.7'), bytes('...cut off...'), 'application/pdf')
    expect(await pdfFilePassesSanityCheck(f)).toBe(false)
  })

  it('read failure does not block → true', async () => {
    const f = {
      name: 'book.pdf',
      type: 'application/pdf',
      slice: () => ({ arrayBuffer: async () => { throw new Error('read fail') } }) as unknown as Blob,
    } as unknown as File
    expect(await pdfFilePassesSanityCheck(f)).toBe(true)
  })
})
