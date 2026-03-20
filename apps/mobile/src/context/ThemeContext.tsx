import { createContext, useContext, useMemo } from 'react'
import { useColorScheme } from 'react-native'
import { colors as lightColors, darkColors } from '../theme/colors'

interface ThemeContextValue {
  colors: typeof lightColors
  isDark: boolean
}

const ThemeContext = createContext<ThemeContextValue>({
  colors: lightColors,
  isDark: false,
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme()
  const isDark = scheme === 'dark'

  const value = useMemo(() => ({
    colors: isDark ? darkColors : lightColors,
    isDark,
  }), [isDark])

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
