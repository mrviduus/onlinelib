import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { LogBox } from 'react-native'
import * as SplashScreen from 'expo-splash-screen'
import { setupApi } from '../src/lib/api'
import { setupNotifications, requestPermissions, scheduleReviewReminder } from '../src/lib/notifications'

// Suppress notification entitlement errors on simulator without push entitlement
LogBox.ignoreLogs(['Calling the \'getRegistrationInfoAsync\'', 'Calling the \'setBadgeCountAsync\''])
import { AuthProvider } from '../src/context/AuthContext'
import { DownloadProvider } from '../src/context/DownloadContext'
import { ErrorBoundary } from '../src/components/ErrorBoundary'

SplashScreen.preventAutoHideAsync()

// Must init API before any component renders (not in useEffect)
setupApi()

export default function RootLayout() {
  useEffect(() => {
    try { setupNotifications() } catch {}

    requestPermissions()
      .then(granted => { if (granted) return scheduleReviewReminder() })
      .catch(() => {})

    SplashScreen.hideAsync()
  }, [])

  return (
    <ErrorBoundary>
      <AuthProvider>
        <DownloadProvider>
          <StatusBar style="auto" />
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
        </DownloadProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}
