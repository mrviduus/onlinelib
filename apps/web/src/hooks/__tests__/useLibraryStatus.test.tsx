import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useLibraryStatus, DEFAULT_STATUS } from '../useLibraryStatus'

const wrapper = (initial = '/library') => ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={[initial]}>{children}</MemoryRouter>
)

describe('useLibraryStatus', () => {
  it('defaults to reading when no status param', () => {
    const { result } = renderHook(() => useLibraryStatus(), { wrapper: wrapper() })
    expect(result.current.status).toBe('reading')
    expect(DEFAULT_STATUS).toBe('reading')
  })

  it('reads valid status values from URL', () => {
    for (const v of ['all', 'reading', 'finished', 'notStarted', 'failed'] as const) {
      const { result } = renderHook(() => useLibraryStatus(), {
        wrapper: wrapper(`/library?status=${v}`),
      })
      expect(result.current.status).toBe(v)
    }
  })

  it('falls back to reading for unknown status value', () => {
    const { result } = renderHook(() => useLibraryStatus(), {
      wrapper: wrapper('/library?status=garbage'),
    })
    expect(result.current.status).toBe('reading')
  })

  it('setStatus(non-default) writes status param', () => {
    let location: { search: string } = { search: '' }
    const Capture = () => { location = useLocation(); return null }
    const w = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={['/library']}>
        <Capture />
        {children}
      </MemoryRouter>
    )
    const { result } = renderHook(() => useLibraryStatus(), { wrapper: w })
    act(() => result.current.setStatus('finished'))
    expect(location.search).toBe('?status=finished')
  })

  it('setStatus(reading) deletes status param (default cleanup)', () => {
    let location: { search: string } = { search: '' }
    const Capture = () => { location = useLocation(); return null }
    const w = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={['/library?status=finished']}>
        <Capture />
        {children}
      </MemoryRouter>
    )
    const { result } = renderHook(() => useLibraryStatus(), { wrapper: w })
    act(() => result.current.setStatus('reading'))
    expect(location.search).toBe('')
  })

  it('preserves other URL params on setStatus', () => {
    let location: { search: string } = { search: '' }
    const Capture = () => { location = useLocation(); return null }
    const w = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={['/library?source=uploads&tag=fantasy']}>
        <Capture />
        {children}
      </MemoryRouter>
    )
    const { result } = renderHook(() => useLibraryStatus(), { wrapper: w })
    act(() => result.current.setStatus('failed'))
    expect(location.search).toContain('source=uploads')
    expect(location.search).toContain('tag=fantasy')
    expect(location.search).toContain('status=failed')
  })
})
