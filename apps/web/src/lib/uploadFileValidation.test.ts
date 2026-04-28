import { describe, it, expect } from 'vitest'
import { isUploadableFile, partitionFiles } from './uploadFileValidation'

function file(name: string, type = ''): File {
  return new File([new Blob(['x'])], name, { type })
}

describe('isUploadableFile', () => {
  it('accepts .epub by extension', () => {
    expect(isUploadableFile(file('book.epub'))).toBe(true)
  })
  it('accepts .pdf by extension', () => {
    expect(isUploadableFile(file('paper.pdf'))).toBe(true)
  })
  it('accepts .fb2 by extension', () => {
    expect(isUploadableFile(file('novel.fb2'))).toBe(true)
  })
  it('accepts .fb2.zip compound extension', () => {
    expect(isUploadableFile(file('novel.fb2.zip'))).toBe(true)
  })
  it('accepts uppercase extensions', () => {
    expect(isUploadableFile(file('BOOK.EPUB'))).toBe(true)
  })
  it('rejects .txt', () => {
    expect(isUploadableFile(file('readme.txt'))).toBe(false)
  })
  it('rejects .docx', () => {
    expect(isUploadableFile(file('doc.docx'))).toBe(false)
  })
  it('rejects image.png', () => {
    expect(isUploadableFile(file('image.png', 'image/png'))).toBe(false)
  })
  it('rejects file with no extension', () => {
    expect(isUploadableFile(file('noext'))).toBe(false)
  })
  it('accepts when extension missing but mimetype matches', () => {
    expect(isUploadableFile(file('weirdname', 'application/pdf'))).toBe(true)
  })
})

describe('partitionFiles', () => {
  it('splits valid and invalid files', () => {
    const files = [file('a.epub'), file('b.txt'), file('c.pdf')]
    const { valid, invalid } = partitionFiles(files)
    expect(valid.map(f => f.name)).toEqual(['a.epub', 'c.pdf'])
    expect(invalid.map(f => f.name)).toEqual(['b.txt'])
  })
  it('empty list returns empty arrays', () => {
    const { valid, invalid } = partitionFiles([])
    expect(valid).toEqual([])
    expect(invalid).toEqual([])
  })
})
