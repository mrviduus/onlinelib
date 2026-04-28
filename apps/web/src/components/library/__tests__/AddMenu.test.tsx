import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

vi.mock('../../../context/LanguageContext', () => ({
  useLanguage: () => ({ getLocalizedPath: (p: string) => p }),
}))

import { AddMenu } from '../AddMenu'

afterEach(() => cleanup())

const renderMenu = (onUpload = () => {}) =>
  render(
    <MemoryRouter>
      <AddMenu onUpload={onUpload} triggerLabel="Add" triggerTitle="Add" />
    </MemoryRouter>,
  )

describe('AddMenu', () => {
  it('opens menu on trigger click', () => {
    renderMenu()
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('renders all menu entries', () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    for (const k of [
      'addMenu.uploadFile',
      'addMenu.pasteUrl',
      'addMenu.emailBook',
      'addMenu.browserExtension',
      'addMenu.mobileApps',
      'addMenu.browseAll',
    ]) {
      expect(screen.getByText(k)).toBeInTheDocument()
    }
  })

  it('marks coming-soon items disabled', () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    const url = screen.getByRole('menuitem', { name: /addMenu\.pasteUrl/ })
    const email = screen.getByRole('menuitem', { name: /addMenu\.emailBook/ })
    expect(url).toBeDisabled()
    expect(email).toBeDisabled()
  })

  it('Upload click triggers onUpload and closes menu', () => {
    const onUpload = vi.fn()
    renderMenu(onUpload)
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /addMenu\.uploadFile/ }))
    expect(onUpload).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('Esc closes menu', () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('click outside closes menu', () => {
    render(
      <MemoryRouter>
        <div data-testid="outside">outside</div>
        <AddMenu onUpload={() => {}} triggerLabel="Add" triggerTitle="Add" />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
