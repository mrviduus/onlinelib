import { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native'
import { useRouter } from 'expo-router'
import { authApi } from '@textstack/shared'
import { useAuth } from '../../src/context/AuthContext'
import { colors } from '../../src/theme/colors'

// Dynamic import — expo-apple-authentication crashes on web
const AppleAuthentication = Platform.OS === 'ios'
  ? require('expo-apple-authentication')
  : null

export default function LoginScreen() {
  const router = useRouter()
  const { signInWithTokens } = useAuth()
  const [loading, setLoading] = useState(false)

  const handleGoogleSignIn = async () => {
    setLoading(true)
    try {
      // Google Sign-In will be configured with @react-native-google-signin/google-signin
      // For now, show placeholder
      Alert.alert('Google Sign-In', 'Configure GOOGLE_WEB_CLIENT_ID in .env to enable')
    } catch (e) {
      Alert.alert('Error', 'Google sign-in failed')
    } finally {
      setLoading(false)
    }
  }

  const handleAppleSignIn = async () => {
    if (!AppleAuthentication) return
    setLoading(true)
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      })

      if (!credential.identityToken) {
        throw new Error('No identity token')
      }

      const fullName = credential.fullName
        ? [credential.fullName.givenName, credential.fullName.familyName]
            .filter(Boolean)
            .join(' ') || null
        : null

      const result = await authApi.loginWithApple(
        credential.identityToken,
        fullName,
        credential.email,
      )

      await signInWithTokens(result.accessToken, result.refreshToken, result.user)
      router.back()
    } catch (e: any) {
      if (e.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Error', 'Apple sign-in failed')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign In</Text>
      <Text style={styles.subtitle}>Access your library, sync progress, and more</Text>

      {loading && <ActivityIndicator style={styles.loader} size="large" color={colors.primary} />}

      <TouchableOpacity
        style={[styles.button, styles.googleButton]}
        onPress={handleGoogleSignIn}
        disabled={loading}
      >
        <Text style={styles.buttonText}>Continue with Google</Text>
      </TouchableOpacity>

      {Platform.OS === 'ios' && AppleAuthentication && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={8}
          style={styles.appleButton}
          onPress={handleAppleSignIn}
        />
      )}

      <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()}>
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: colors.background,
  },
  title: { fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: 8 },
  subtitle: { fontSize: 15, color: colors.textSecondary, marginBottom: 32, textAlign: 'center' },
  loader: { marginBottom: 16 },
  button: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  googleButton: {
    backgroundColor: '#4285F4',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  appleButton: {
    width: '100%',
    height: 48,
    marginBottom: 12,
  },
  cancelButton: { marginTop: 16 },
  cancelText: { fontSize: 16, color: colors.textSecondary },
})
