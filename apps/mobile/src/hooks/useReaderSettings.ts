import { useState, useEffect, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

export interface ReaderSettings {
  fontSize: number
  lineHeight: number
  fontFamily: 'serif' | 'sans' | 'dyslexic'
  textAlign: 'left' | 'center' | 'justify'
  theme: 'light' | 'sepia' | 'dark'
  ttsSpeed: number
  autoLookup: boolean
  showReaderStats: boolean
}

const STORAGE_KEY = 'reader.settings.v2'
const LEGACY_KEY = 'reader.settings.v1'

const defaults: ReaderSettings = {
  fontSize: 18,
  lineHeight: 1.65,
  fontFamily: 'serif',
  textAlign: 'left',
  theme: 'light',
  ttsSpeed: 1.0,
  autoLookup: false,
  showReaderStats: true,
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
    AsyncStorage.getItem(STORAGE_KEY).then(async raw => {
      if (raw) {
        try {
          setSettings({ ...defaults, ...JSON.parse(raw) })
        } catch {}
        return
      }
      // Migrate from v1
      const legacy = await AsyncStorage.getItem(LEGACY_KEY)
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
    })
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
