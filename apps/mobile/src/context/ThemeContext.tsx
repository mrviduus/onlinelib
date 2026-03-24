import { createContext, useContext, useMemo, useState, useEffect, useCallback } from 'react'
import { useColorScheme } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { colors as lightColors, darkColors } from '../theme/colors'

type ThemeMode = 'system' | 'light' | 'dark'
const STORAGE_KEY = 'textstack-theme'

interface ThemeContextValue {
  colors: typeof lightColors
  isDark: boolean
  themeMode: ThemeMode
  setThemeMode: (mode: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  colors: lightColors,
  isDark: false,
  themeMode: 'system',
  setThemeMode: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme()
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system')

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(v => {
      if (v === 'light' || v === 'dark') setThemeModeState(v)
    }).catch(() => {})
  }, [])

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode)
    if (mode === 'system') {
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {})
    } else {
      AsyncStorage.setItem(STORAGE_KEY, mode).catch(() => {})
    }
  }, [])

  const isDark = themeMode === 'system' ? scheme === 'dark' : themeMode === 'dark'

  const value = useMemo(() => ({
    colors: isDark ? darkColors : lightColors,
    isDark,
    themeMode,
    setThemeMode,
  }), [isDark, themeMode, setThemeMode])

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
