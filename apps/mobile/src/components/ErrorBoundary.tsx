import { Component } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native'
import type { ReactNode, ErrorInfo } from 'react'
import { colors, darkColors } from '../theme/colors'
import { Sentry } from '../lib/sentry'

/**
 * The fallback is its own function component so it can read a colour scheme at all —
 * `ErrorBoundary` must be a class (that is the only way to catch render errors), and
 * it is mounted ABOVE `ThemeProvider` in `app/_layout.tsx`, so `useTheme()` is out of
 * reach here by construction. It used to import the light palette statically, which
 * made the crash screen a white flash for every dark-mode user.
 *
 * `useColorScheme()` is the OS preference, not the user's in-app override. That is the
 * honest approximation available above the provider: a user who forced light while the
 * OS is dark sees a dark crash screen. Readable either way, which is the bar here.
 */
function ErrorFallback({ message, onReset }: { message: string; onReset: () => void }) {
  const scheme = useColorScheme()
  const c = scheme === 'dark' ? darkColors : colors
  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <Text style={[styles.title, { color: c.text }]}>Something went wrong</Text>
      <Text style={[styles.message, { color: c.textSecondary }]} numberOfLines={4}>
        {message}
      </Text>
      <TouchableOpacity
        style={[styles.btn, { backgroundColor: c.primary }]}
        onPress={onReset}
        accessibilityRole="button"
        accessibilityLabel="Try again"
      >
        <Text style={styles.btnText}>Try Again</Text>
      </TouchableOpacity>
    </View>
  )
}

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack)
    // Until now this line was the whole story: a user saw the fallback screen and
    // nobody ever learned why. React errors caught here never reach Play Console's
    // crash reporting either, since the app does not crash — it renders this.
    // No-op when no DSN is configured.
    Sentry.captureException(error, {
      contexts: { react: { componentStack: info.componentStack } },
    })
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          message={this.state.error?.message || 'Unknown error'}
          onReset={this.handleReset}
        />
      )
    }

    return this.props.children
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  message: { fontSize: 14, textAlign: 'center', marginBottom: 24 },
  btn: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
})
