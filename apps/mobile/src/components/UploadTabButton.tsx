import { TouchableOpacity, View, StyleSheet, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'

export function UploadTabButton() {
  const { colors } = useTheme()
  const { isAuthenticated } = useAuth()
  const router = useRouter()

  const onPress = () => {
    if (!isAuthenticated) {
      router.push('/auth/login')
      return
    }
    router.push('/my-books/upload')
  }

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="Upload"
      onPress={onPress}
      activeOpacity={0.85}
      style={styles.wrapper}
    >
      <View style={[styles.button, { backgroundColor: colors.primary, shadowColor: colors.text }]}>
        <Ionicons name="add" size={28} color="#fff" />
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    top: -18,
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
  },
  button: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
      },
      android: { elevation: 6 },
    }),
  },
})
