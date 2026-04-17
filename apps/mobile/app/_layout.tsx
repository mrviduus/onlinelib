import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { setupApi } from '../src/lib/api'
import { AuthProvider } from '../src/context/AuthContext'
import { DownloadProvider } from '../src/context/DownloadContext'
import { ThemeProvider, useTheme } from '../src/context/ThemeContext'
import { LanguageProvider } from '../src/context/LanguageContext'
import { NativeLanguageProvider } from '../src/context/NativeLanguageContext'
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
        <Stack.Screen name="reader/[bookSlug]/[chapterSlug]" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="reader/[bookSlug]/focus/[chapterSlug]" options={{ animation: 'fade' }} />
        <Stack.Screen name="vocabulary/index" />
        <Stack.Screen name="vocabulary/review" />
        <Stack.Screen name="stats/index" />
        <Stack.Screen name="author/[slug]" />
        <Stack.Screen name="genre/[slug]" />
        <Stack.Screen name="my-books/upload" options={{ presentation: 'modal' }} />
        <Stack.Screen name="my-books/[id]" />
        <Stack.Screen name="my-books/read/[bookId]/[chapterSlug]" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="my-books/read/[bookId]/focus/[chapterSlug]" options={{ animation: 'fade' }} />
        <Stack.Screen name="blog/index" />
        <Stack.Screen name="blog/[slug]" />
        <Stack.Screen name="highlights/index" />
        <Stack.Screen name="highlights/review" />
        <Stack.Screen name="about" />
        <Stack.Screen name="privacy" />
        <Stack.Screen name="terms" />
        <Stack.Screen name="contact" />
        <Stack.Screen name="books" />
        <Stack.Screen name="authors" />
      </Stack>
    </>
  )
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useAppFonts()

  useEffect(() => {
    console.log('[TextStack] RootLayout mounted, fontsLoaded:', fontsLoaded, 'fontError:', fontError)
  }, [fontsLoaded, fontError])

  useEffect(() => {
    if (fontsLoaded || fontError) {
      console.log('[TextStack] Hiding splash, fontsLoaded:', fontsLoaded, 'fontError:', fontError)
      SplashScreen.hideAsync()
    }
  }, [fontsLoaded, fontError])

  if (!fontsLoaded && !fontError) return null

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <ThemeProvider>
          <LanguageProvider>
            <NativeLanguageProvider>
              <AuthProvider>
                <DownloadProvider>
                  <AppContent />
                </DownloadProvider>
              </AuthProvider>
            </NativeLanguageProvider>
          </LanguageProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  )
}
