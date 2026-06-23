import { describe, it, expect } from 'vitest'
import { isDeleteConfirmed, DELETE_CONFIRM_PHRASE } from '../DeleteAccountDialog'

describe('isDeleteConfirmed', () => {
  it('arms only on the exact phrase', () => {
    expect(isDeleteConfirmed(DELETE_CONFIRM_PHRASE)).toBe(true)
  })

  it('trims surrounding whitespace', () => {
    expect(isDeleteConfirmed('  DELETE  ')).toBe(true)
  })

  it('rejects empty, partial, and wrong-case input', () => {
    expect(isDeleteConfirmed('')).toBe(false)
    expect(isDeleteConfirmed('DELET')).toBe(false)
    expect(isDeleteConfirmed('delete')).toBe(false)
    expect(isDeleteConfirmed('DELETE ME')).toBe(false)
  })
})
