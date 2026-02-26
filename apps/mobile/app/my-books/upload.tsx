import { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, SafeAreaView } from 'react-native'
import { useRouter, Stack } from 'expo-router'
import * as DocumentPicker from 'expo-document-picker'
import { userBooksApi } from '@textstack/shared'
import { colors } from '../../src/theme/colors'

export default function UploadScreen() {
  const router = useRouter()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)

  const pickAndUpload = async () => {
    setError(null)
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/epub+zip',
          'application/pdf',
          'application/x-fictionbook+xml',
          'application/octet-stream',
        ],
        copyToCacheDirectory: true,
      })

      if (result.canceled) return

      const file = result.assets[0]
      setFileName(file.name)
      setUploading(true)

      const formData = new FormData()
      formData.append('file', {
        uri: file.uri,
        name: file.name,
        type: file.mimeType || 'application/octet-stream',
      } as any)

      await userBooksApi.uploadUserBook(formData)
      router.back()
    } catch (e: any) {
      setError(e?.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Upload Book' }} />
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Upload a Book</Text>
          <Text style={styles.subtitle}>Supported formats: EPUB, PDF, FB2</Text>

          {uploading ? (
            <View style={styles.uploadingBox}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.uploadingText}>Uploading {fileName}...</Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.pickBtn} onPress={pickAndUpload}>
              <Text style={styles.pickBtnText}>Choose File</Text>
            </TouchableOpacity>
          )}

          {error && <Text style={styles.error}>{error}</Text>}
        </View>
      </SafeAreaView>
    </>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: 8 },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginBottom: 32 },
  pickBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
  },
  pickBtnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  uploadingBox: { alignItems: 'center', gap: 12 },
  uploadingText: { fontSize: 14, color: colors.textSecondary },
  error: { color: '#DC2626', fontSize: 14, marginTop: 16, textAlign: 'center' },
})
