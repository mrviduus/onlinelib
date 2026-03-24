import { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { authApi } from '@textstack/shared'
import { GoogleSignin } from '@react-native-google-signin/google-signin'
import { useAuth } from '../../src/context/AuthContext'
import { useTheme } from '../../src/context/ThemeContext'
import { fonts } from '../../src/theme/typography'

GoogleSignin.configure({
  webClientId: '301013894506-7ouh9ops30ubjg6s6govpeep19h26r6q.apps.googleusercontent.com',
})

// Dynamic import — expo-apple-authentication crashes on web
const AppleAuthentication = Platform.OS === 'ios'
  ? require('expo-apple-authentication')
  : null

export default function LoginScreen() {
  const { colors } = useTheme()
  const router = useRouter()
  const { signInWithTokens } = useAuth()
  const [loading, setLoading] = useState(false)

  const handleGoogleSignIn = async () => {
    setLoading(true)
    try {
      await GoogleSignin.hasPlayServices()
      const response = await GoogleSignin.signIn()
      const idToken = response.data?.idToken
      if (!idToken) throw new Error('No ID token')

      const result = await authApi.loginWithGoogle(idToken)
      await signInWithTokens(result.accessToken, result.refreshToken, result.user)
      router.back()
    } catch (e: any) {
      if (e.code !== 'SIGN_IN_CANCELLED') {
        Alert.alert('Error', 'Google sign-in failed')
      }
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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Ionicons name="book" size={48} color={colors.primary} style={{ marginBottom: 12 }} />
      <Text style={[styles.brand, { color: colors.text, fontFamily: fonts.serifBold }]}>TextStack</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary, fontFamily: fonts.sans }]}>
        Your reading journey starts here
      </Text>

      {loading && <ActivityIndicator style={styles.loader} size="large" color={colors.primary} />}

      <TouchableOpacity
        style={[styles.button, styles.googleButton]}
        onPress={handleGoogleSignIn}
        disabled={loading}
      >
        <Ionicons name="logo-google" size={20} color="#fff" style={{ marginRight: 8 }} />
        <Text style={[styles.buttonText, { fontFamily: fonts.sansMedium }]}>Continue with Google</Text>
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
        <Text style={[styles.cancelText, { color: colors.textSecondary, fontFamily: fonts.sansMedium }]}>Cancel</Text>
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
  },
  brand: { fontSize: 32, marginBottom: 8 },
  subtitle: { fontSize: 15, marginBottom: 32, textAlign: 'center' },
  loader: { marginBottom: 16 },
  button: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  googleButton: {
    backgroundColor: '#4285F4',
  },
  buttonText: { color: '#fff', fontSize: 16 },
  appleButton: {
    width: '100%',
    height: 48,
    marginBottom: 12,
  },
  cancelButton: { marginTop: 16 },
  cancelText: { fontSize: 16 },
})
