import { useState } from 'react'
import { TouchableOpacity, View, StyleSheet, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import { capabilitiesFor } from '../lib/capabilities'
import { AddMenuBottomSheet } from './library/AddMenuBottomSheet'

export function UploadTabButton() {
  const { colors } = useTheme()
  const { user } = useAuth()
  const router = useRouter()
  const [sheetOpen, setSheetOpen] = useState(false)

  const goUpload = () => router.push('/my-books/upload')

  // `canUpload`, not `isAuthenticated`. The tab layout already hides this button
  // from anyone who can't upload, so in practice a guest never sees it — but the
  // predicate has to agree with the one that hid it, or the day the layout changes
  // this becomes a "+" that opens the picker for a session that can't keep the file.
  const onPress = () => {
    if (!capabilitiesFor(user).canUpload) {
      router.push('/(auth)/login')
      return
    }
    setSheetOpen(true)
  }

  return (
    <>
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
      <AddMenuBottomSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onUpload={goUpload}
      />
    </>
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
