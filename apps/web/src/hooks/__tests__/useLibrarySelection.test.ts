import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLibrarySelection } from '../useLibrarySelection'

describe('useLibrarySelection', () => {
  it('toggle adds and removes ids', () => {
    const { result } = renderHook(() => useLibrarySelection())
    act(() => { result.current.enter() })
    act(() => { result.current.toggle('a') })
    expect(result.current.isSelected('a')).toBe(true)
    expect(result.current.count).toBe(1)
    act(() => { result.current.toggle('a') })
    expect(result.current.isSelected('a')).toBe(false)
    expect(result.current.count).toBe(0)
  })

  it('selectAll selects all visible items', () => {
    const { result } = renderHook(() => useLibrarySelection())
    act(() => { result.current.enter() })
    act(() => { result.current.selectAll([{ id: 'a' }, { id: 'b' }, { id: 'c' }]) })
    expect(result.current.count).toBe(3)
    expect(result.current.isSelected('b')).toBe(true)
  })

  it('exit clears selection and deactivates', () => {
    const { result } = renderHook(() => useLibrarySelection())
    act(() => { result.current.enter() })
    act(() => { result.current.toggle('a'); result.current.toggle('b') })
    expect(result.current.count).toBe(2)
    act(() => { result.current.exit() })
    expect(result.current.active).toBe(false)
    expect(result.current.count).toBe(0)
  })

  it('clear empties selection but keeps mode active', () => {
    const { result } = renderHook(() => useLibrarySelection())
    act(() => { result.current.enter() })
    act(() => { result.current.toggle('a') })
    act(() => { result.current.clear() })
    expect(result.current.active).toBe(true)
    expect(result.current.count).toBe(0)
  })
})
