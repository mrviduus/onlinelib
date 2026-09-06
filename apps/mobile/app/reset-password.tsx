import { useEffect, useRef, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { authApi } from '@textstack/shared'
import { useTheme } from '../src/context/ThemeContext'
import { fonts } from '../src/theme/typography'

export default function ResetPasswordScreen() {
  const { colors } = useTheme()
  const router = useRouter()
  const { token } = useLocalSearchParams<{ token?: string }>()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  const handleSubmit = async () => {
    if (loading) return
    setError('')
    if (!token) return
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    setLoading(true)
    try {
      await authApi.resetPassword(token, password)
      if (mountedRef.current) setSuccess(true)
    } catch (e: any) {
      if (!mountedRef.current) return
      console.warn('Reset password failed:', e)
      setError(e?.message || 'Reset failed.')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }

  if (!token) {
    return (
      <>
        <Stack.Screen options={{ title: 'Reset Password', headerShown: true, headerStyle: { backgroundColor: colors.background }, headerShadowVisible: false }} />
        <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center' }]}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.textSecondary} style={{ alignSelf: 'center', marginBottom: 12 }} />
          <Text style={[styles.title, { color: colors.text, fontFamily: fonts.serifBold }]}>Invalid link</Text>
          <Text style={[styles.body, { color: colors.textSecondary, fontFamily: fonts.sans }]}>
            This reset link is invalid or has expired.
          </Text>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary }]}
            onPress={() => router.replace('/(auth)/login')}
            activeOpacity={0.85}
          >
            <Text style={[styles.btnText, { fontFamily: fonts.sansMedium }]}>Back to Sign in</Text>
          </TouchableOpacity>
        </View>
      </>
    )
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Reset Password', headerShown: true, headerStyle: { backgroundColor: colors.background }, headerShadowVisible: false }} />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          {success ? (
            <>
              <Ionicons name="checkmark-circle" size={56} color={colors.success} style={{ alignSelf: 'center', marginBottom: 12 }} />
              <Text style={[styles.title, { color: colors.text, fontFamily: fonts.serifBold }]}>Password reset</Text>
              <Text style={[styles.body, { color: colors.textSecondary, fontFamily: fonts.sans }]}>
                Your password has been updated. You can now sign in.
              </Text>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: colors.primary }]}
                onPress={() => router.replace('/(auth)/login')}
                activeOpacity={0.85}
              >
                <Text style={[styles.btnText, { fontFamily: fonts.sansMedium }]}>Sign in</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={[styles.title, { color: colors.text, fontFamily: fonts.serifBold }]}>Set new password</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text, fontFamily: fonts.sans }]}
                placeholder="New password (min 8 characters)"
                placeholderTextColor={colors.textSecondary}
                secureTextEntry
                value={password}
                // Same defect as the sign-in form: the length error cleared only
                // on the next submit, so it stayed red while the user typed the
                // characters that fixed it. This is the first screen after a
                // reset email, so it is the worst place to look broken.
                onChangeText={text => { setPassword(text); if (error) setError('') }}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={handleSubmit}
                returnKeyType="go"
                textContentType="newPassword"
                autoComplete="password-new"
                accessibilityLabel="New password"
              />
              {error ? <Text style={[styles.error, { color: colors.error, fontFamily: fonts.sans }]}>{error}</Text> : null}
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: colors.primary, opacity: loading ? 0.6 : 1 }]}
                onPress={handleSubmit}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={[styles.btnText, { fontFamily: fonts.sansMedium }]}>Reset password</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 24, marginBottom: 16, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 24 },
  input: { height: 48, borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, fontSize: 15, marginBottom: 12 },
  error: { fontSize: 13, marginBottom: 12, textAlign: 'center' },
  btn: { height: 48, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontSize: 15 },
})
