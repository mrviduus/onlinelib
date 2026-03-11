import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ShareButtons } from '../ShareButtons'

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'share.share': 'Share',
        'share.shareOn': 'Share on',
        'share.copyLink': 'Copy link',
        'share.linkCopied': 'Link copied!',
      }
      return map[key] || key
    },
  }),
}))

const url = 'https://textstack.app/en/books/dracula'
const title = 'Dracula'

beforeEach(() => {
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ShareButtons', () => {
  it('renders social buttons by default', () => {
    render(<ShareButtons url={url} title={title} />)

    const links = screen.getAllByRole('link')
    expect(links.length).toBe(4) // X, Facebook, Telegram, LinkedIn

    expect(links[0]).toHaveAttribute('href', expect.stringContaining('twitter.com/intent/tweet'))
    expect(links[1]).toHaveAttribute('href', expect.stringContaining('facebook.com/sharer'))
    expect(links[2]).toHaveAttribute('href', expect.stringContaining('t.me/share/url'))
    expect(links[3]).toHaveAttribute('href', expect.stringContaining('linkedin.com/sharing'))
  })

  it('hides social buttons when linkOnly', () => {
    render(<ShareButtons url={url} title={title} linkOnly />)

    const links = screen.queryAllByRole('link')
    expect(links.length).toBe(0)

    // Copy button still present
    expect(screen.getByTitle('Copy link')).toBeInTheDocument()
  })

  it('copies bare URL when no subtitle', async () => {
    render(<ShareButtons url={url} title={title} />)

    await act(async () => {
      fireEvent.click(screen.getByTitle('Copy link'))
    })

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(url)
  })

  it('copies rich text when subtitle provided', async () => {
    render(<ShareButtons url={url} title={title} subtitle="Bram Stoker" />)

    await act(async () => {
      fireEvent.click(screen.getByTitle('Copy link'))
    })

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `Dracula — Bram Stoker\n${url}`
    )
  })

  it('shows copied state after click', async () => {
    vi.useFakeTimers()
    render(<ShareButtons url={url} title={title} />)

    await act(async () => {
      fireEvent.click(screen.getByTitle('Copy link'))
    })

    expect(screen.getByTitle('Link copied!')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(screen.getByTitle('Copy link')).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('social links open in new tab', () => {
    render(<ShareButtons url={url} title={title} />)

    const links = screen.getAllByRole('link')
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
  })

  it('telegram link has correct format', () => {
    render(<ShareButtons url={url} title={title} />)

    const links = screen.getAllByRole('link')
    const telegram = links[2]
    const href = telegram.getAttribute('href')!

    expect(href).toContain('t.me/share/url')
    expect(href).toContain(`url=${encodeURIComponent(url)}`)
    expect(href).toContain(`text=${encodeURIComponent(title)}`)
  })

  it('applies custom className', () => {
    const { container } = render(<ShareButtons url={url} title={title} className="custom" />)
    expect(container.firstChild).toHaveClass('share-buttons', 'custom')
  })
})
