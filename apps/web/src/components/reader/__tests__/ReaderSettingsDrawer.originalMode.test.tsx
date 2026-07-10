import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReaderSettingsDrawer } from '../ReaderSettingsDrawer'
import type { ReaderSettings } from '../../../hooks/useReaderSettings'

const settings: ReaderSettings = {
  fontSize: 18,
  lineHeight: 1.65,
  textAlign: 'left',
  theme: 'light',
  fontFamily: 'serif',
  ttsSpeed: 1.0,
  ttsVoiceEn: 'en-US-AriaNeural',
  showInlineTranslations: false,
  showReaderStats: false,
}

function renderDrawer(originalMode: boolean) {
  return render(
    <ReaderSettingsDrawer
      open
      settings={settings}
      onUpdate={() => {}}
      onClose={() => {}}
      originalMode={originalMode}
    />,
  )
}

describe('ReaderSettingsDrawer — Original-layout PDF', () => {
  it('shows typography rows in reflow mode', () => {
    renderDrawer(false)
    expect(screen.getByText('Font Size')).toBeTruthy()
    expect(screen.getByText('Line Height')).toBeTruthy()
    expect(screen.getByText('Text Align')).toBeTruthy()
    expect(screen.getByText('Font')).toBeTruthy()
  })

  it('hides typography rows but keeps TTS + translations + theme in Original mode', () => {
    renderDrawer(true)
    expect(screen.queryByText('Font Size')).toBeNull()
    expect(screen.queryByText('Line Height')).toBeNull()
    expect(screen.queryByText('Text Align')).toBeNull()
    expect(screen.queryByText('Font')).toBeNull()
    // Still-relevant rows remain.
    expect(screen.getByText('TTS Speed')).toBeTruthy()
    expect(screen.getByText('Inline Translations')).toBeTruthy()
    expect(screen.getByText('Theme')).toBeTruthy()
  })
})
