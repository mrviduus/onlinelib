import { useState } from 'react'
import { TouchableOpacity, View, StyleSheet, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import { FEATURES } from '../lib/features'
import { AddMenuBottomSheet } from './library/AddMenuBottomSheet'

export function UploadTabButton() {
  const { colors } = useTheme()
  const { isAuthenticated } = useAuth()
  const router = useRouter()
  const [sheetOpen, setSheetOpen] = useState(false)
  const addMenu = FEATURES.myBooksV3AddMenu

  const goUpload = () => router.push('/my-books/upload')

  const onPress = () => {
    if (!isAuthenticated) {
      router.push('/auth/login')
      return
    }
    if (addMenu) {
      setSheetOpen(true)
    } else {
      goUpload()
    }
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
      {addMenu && (
        <AddMenuBottomSheet
          visible={sheetOpen}
          onClose={() => setSheetOpen(false)}
          onUpload={goUpload}
        />
      )}
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
