import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { LogBox } from 'react-native'
import * as SplashScreen from 'expo-splash-screen'
import { setupApi } from '../src/lib/api'
import { setupNotifications, requestPermissions, scheduleReviewReminder } from '../src/lib/notifications'

LogBox.ignoreLogs(['Calling the \'getRegistrationInfoAsync\'', 'Calling the \'setBadgeCountAsync\''])
import { AuthProvider } from '../src/context/AuthContext'
import { DownloadProvider } from '../src/context/DownloadContext'
import { ThemeProvider, useTheme } from '../src/context/ThemeContext'
import { ErrorBoundary } from '../src/components/ErrorBoundary'
import { useAppFonts } from '../src/theme/fonts'

SplashScreen.preventAutoHideAsync()

setupApi()

function AppContent() {
  const { isDark } = useTheme()

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)/login" options={{ presentation: 'modal' }} />
        <Stack.Screen name="book/[slug]" />
        <Stack.Screen name="reader/[bookSlug]/[chapterSlug]" />
        <Stack.Screen name="vocabulary/index" />
        <Stack.Screen name="vocabulary/review" />
        <Stack.Screen name="stats/index" />
        <Stack.Screen name="author/[slug]" />
        <Stack.Screen name="genre/[slug]" />
        <Stack.Screen name="my-books/upload" options={{ presentation: 'modal' }} />
        <Stack.Screen name="my-books/[id]" />
        <Stack.Screen name="my-books/read/[bookId]/[chapterSlug]" />
      </Stack>
    </>
  )
}

export default function RootLayout() {
  const [fontsLoaded] = useAppFonts()

  useEffect(() => {
    try { setupNotifications() } catch {}

    requestPermissions()
      .then(granted => { if (granted) return scheduleReviewReminder() })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync()
  }, [fontsLoaded])

  if (!fontsLoaded) return null

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <DownloadProvider>
            <AppContent />
          </DownloadProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}
