import { useState, useEffect, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

export interface ReaderSettings {
  fontSize: number
  lineHeight: number
  fontFamily: 'serif' | 'sans' | 'dyslexic'
  textAlign: 'left' | 'center' | 'justify'
  theme: 'light' | 'sepia' | 'dark'
  ttsSpeed: number
  /**
   * "Auto-save words on tap" toggle. Historical name — was "auto-open
   * dictionary on tap" before the Free Dictionary API was dropped from
   * mobile (2026-05-15). Field name kept for persisted-settings
   * back-compat; UI label updated.
   */
  autoLookup: boolean
  /**
   * Speak the word when a vocabulary card appears, without waiting for a tap.
   *
   * The speaker button was always there and always worked; QA confirmed it by
   * watching a fourth AudioTrack open on the process. But nothing ever said the
   * word on its own, so hearing it was a thing you had to know to ask for — on a
   * screen whose whole job is learning the word. Default on, off in one tap.
   */
  autoSpeakCards: boolean
  showReaderStats: boolean
  showInlineTranslations: boolean
  /** Last color picked when creating a highlight. The SelectionActionBar
   *  uses a single highlight button (no inline palette) — first tap commits
   *  this color, and changing the color happens via HighlightNoteModal. */
  lastHighlightColor: 'yellow' | 'green' | 'pink' | 'blue'
}

const STORAGE_KEY = 'reader.settings.v2'
const LEGACY_KEY = 'reader.settings.v1'

const defaults: ReaderSettings = {
  fontSize: 18,
  lineHeight: 1.65,
  fontFamily: 'serif',
  // Owner's call, and it also ends a disagreement: web has defaulted to
  // 'center' since it shipped, so the two clients now open a book the same way.
  // Existing readers keep whatever they chose — this is the default for a fresh
  // install, and the setting has three options in the drawer.
  textAlign: 'center',
  theme: 'light',
  ttsSpeed: 1.0,
  autoLookup: false,
  autoSpeakCards: true,
  showReaderStats: true,
  showInlineTranslations: true,
  lastHighlightColor: 'yellow',
}

const fontFamilyMap: Record<string, string> = {
  serif: 'Georgia, "Times New Roman", serif',
  sans: '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  dyslexic: '"OpenDyslexic", sans-serif',
}

export const themeStyles = {
  light: { backgroundColor: '#FFFFFF', textColor: '#111827' },
  sepia: { backgroundColor: '#F4ECD8', textColor: '#433422' },
  dark: { backgroundColor: '#1A1A2E', textColor: '#E0E0E0' },
}

export function useReaderSettings() {
  const [settings, setSettings] = useState<ReaderSettings>(defaults)

  useEffect(() => {
    let cancelled = false
    AsyncStorage.getItem(STORAGE_KEY).then(async raw => {
      if (cancelled) return
      if (raw) {
        try {
          setSettings({ ...defaults, ...JSON.parse(raw) })
        } catch {}
        return
      }
      // Migrate from v1
      const legacy = await AsyncStorage.getItem(LEGACY_KEY)
      if (cancelled) return
      if (legacy) {
        try {
          const old = JSON.parse(legacy)
          if (old.fontFamily === 'system') old.fontFamily = 'sans'
          const migrated = { ...defaults, ...old }
          setSettings(migrated)
          AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
          AsyncStorage.removeItem(LEGACY_KEY)
        } catch {}
      }
    }).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const update = useCallback((patch: Partial<ReaderSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch }
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const resolvedFontFamily = fontFamilyMap[settings.fontFamily] || fontFamilyMap.serif
  const resolvedTheme = themeStyles[settings.theme]

  return {
    settings,
    update,
    resolvedFontFamily,
    resolvedTheme,
  }
}
