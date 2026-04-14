import { useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Alert, Platform, TextInput, KeyboardAvoidingView, ScrollView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { authApi } from '@textstack/shared'
import { GoogleSignin } from '@react-native-google-signin/google-signin'
import { useAuth } from '../../src/context/AuthContext'
import { useTheme } from '../../src/context/ThemeContext'
import { fonts } from '../../src/theme/typography'

GoogleSignin.configure({
  iosClientId: '301013894506-7ouh9ops30ubjg6s6govpeep19h26r6q.apps.googleusercontent.com',
  webClientId: '301013894506-7ouh9ops30ubjg6s6govpeep19h26r6q.apps.googleusercontent.com',
})

// Dynamic import — expo-apple-authentication crashes on web
const AppleAuthentication = Platform.OS === 'ios'
  ? require('expo-apple-authentication')
  : null

type Mode = 'login' | 'register' | 'forgot'

export default function LoginScreen() {
  const { colors } = useTheme()
  const router = useRouter()
  const { signInWithTokens } = useAuth()
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [forgotSent, setForgotSent] = useState(false)

  const resetForm = () => { setEmail(''); setPassword(''); setName(''); setError(''); setForgotSent(false) }
  const switchMode = (m: Mode) => { resetForm(); setMode(m) }

  const handleEmailAuth = async () => {
    setError('')
    if (!email.trim()) { setError('Email is required.'); return }
    if (mode !== 'forgot' && password.length < 8) { setError('Password must be at least 8 characters.'); return }

    setLoading(true)
    try {
      if (mode === 'forgot') {
        await authApi.forgotPassword(email.trim())
        setForgotSent(true)
      } else if (mode === 'register') {
        const result = await authApi.registerWithEmail(email.trim(), password, name.trim() || undefined)
        await signInWithTokens(result.accessToken, result.refreshToken, result.user)
        router.back()
      } else {
        const result = await authApi.loginWithEmail(email.trim(), password)
        await signInWithTokens(result.accessToken, result.refreshToken, result.user)
        router.back()
      }
    } catch (e: any) {
      setError(e.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

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

  const inputStyle = [styles.input, {
    backgroundColor: colors.surface,
    color: colors.text,
    borderColor: colors.border,
    fontFamily: fonts.sans,
  }]

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Ionicons name="book" size={48} color={colors.primary} style={{ marginBottom: 12 }} />
        <Text style={[styles.brand, { color: colors.text, fontFamily: fonts.serifBold }]}>TextStack</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary, fontFamily: fonts.sans }]}>
          Your reading journey starts here
        </Text>

        {/* Mode tabs */}
        {mode !== 'forgot' && (
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, mode === 'login' && { borderBottomColor: colors.primary }]}
              onPress={() => switchMode('login')}
            >
              <Text style={[styles.tabText, {
                color: mode === 'login' ? colors.primary : colors.textSecondary,
                fontFamily: fonts.sansMedium,
              }]}>Sign in</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, mode === 'register' && { borderBottomColor: colors.primary }]}
              onPress={() => switchMode('register')}
            >
              <Text style={[styles.tabText, {
                color: mode === 'register' ? colors.primary : colors.textSecondary,
                fontFamily: fonts.sansMedium,
              }]}>Register</Text>
            </TouchableOpacity>
          </View>
        )}

        {mode === 'forgot' && forgotSent ? (
          <View style={styles.forgotSent}>
            <Ionicons name="mail-outline" size={32} color={colors.primary} />
            <Text style={[styles.forgotSentText, { color: colors.text, fontFamily: fonts.sans }]}>
              If an account exists for {email}, we sent a reset link.
            </Text>
            <TouchableOpacity onPress={() => switchMode('login')}>
              <Text style={[styles.linkText, { color: colors.primary, fontFamily: fonts.sansMedium }]}>
                Back to sign in
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {mode === 'forgot' && (
              <Text style={[styles.forgotTitle, { color: colors.text, fontFamily: fonts.sansMedium }]}>
                Reset password
              </Text>
            )}

            {mode === 'register' && (
              <TextInput
                style={inputStyle}
                placeholder="Name (optional)"
                placeholderTextColor={colors.textSecondary}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            )}

            <TextInput
              style={inputStyle}
              placeholder="Email"
              placeholderTextColor={colors.textSecondary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />

            {mode !== 'forgot' && (
              <TextInput
                style={inputStyle}
                placeholder="Password"
                placeholderTextColor={colors.textSecondary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
              />
            )}

            {!!error && (
              <Text style={[styles.error, { fontFamily: fonts.sans }]}>{error}</Text>
            )}

            <TouchableOpacity
              style={[styles.button, styles.emailButton, { backgroundColor: colors.primary }]}
              onPress={handleEmailAuth}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={[styles.buttonText, { fontFamily: fonts.sansMedium }]}>
                  {mode === 'forgot' ? 'Send reset link' : mode === 'login' ? 'Sign in' : 'Create account'}
                </Text>
              )}
            </TouchableOpacity>

            {mode === 'login' && (
              <TouchableOpacity onPress={() => switchMode('forgot')}>
                <Text style={[styles.linkText, { color: colors.textSecondary, fontFamily: fonts.sans }]}>
                  Forgot password?
                </Text>
              </TouchableOpacity>
            )}

            {mode === 'forgot' && (
              <TouchableOpacity onPress={() => switchMode('login')}>
                <Text style={[styles.linkText, { color: colors.textSecondary, fontFamily: fonts.sans }]}>
                  Back to sign in
                </Text>
              </TouchableOpacity>
            )}

            {mode !== 'forgot' && (
              <>
                <View style={[styles.divider, { borderColor: colors.border }]}>
                  <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                  <Text style={[styles.dividerText, { color: colors.textSecondary, fontFamily: fonts.sans }]}>or</Text>
                  <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                </View>

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
              </>
            )}
          </>
        )}

        <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()}>
          <Text style={[styles.cancelText, { color: colors.textSecondary, fontFamily: fonts.sansMedium }]}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  brand: { fontSize: 32, marginBottom: 8 },
  subtitle: { fontSize: 15, marginBottom: 24, textAlign: 'center' },
  tabs: {
    flexDirection: 'row',
    width: '100%',
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: { fontSize: 15 },
  input: {
    width: '100%',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 15,
    marginBottom: 10,
  },
  error: {
    color: '#ef4444',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 8,
  },
  button: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  emailButton: {},
  googleButton: {
    backgroundColor: '#4285F4',
  },
  buttonText: { color: '#fff', fontSize: 16 },
  appleButton: {
    width: '100%',
    height: 48,
    marginBottom: 12,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginVertical: 16,
  },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { marginHorizontal: 12, fontSize: 13 },
  linkText: {
    fontSize: 13,
    marginTop: 4,
    marginBottom: 8,
  },
  forgotTitle: {
    fontSize: 18,
    marginBottom: 16,
    textAlign: 'center',
  },
  forgotSent: {
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  forgotSentText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  cancelButton: { marginTop: 8 },
  cancelText: { fontSize: 16 },
})
