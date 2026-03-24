import { useState, useEffect, useRef } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native'
import { useRouter, Stack } from 'expo-router'
import * as DocumentPicker from 'expo-document-picker'
import { userBooksApi, getApiConfig } from '@textstack/shared'
import { colors } from '../../src/theme/colors'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export default function UploadScreen() {
  const router = useRouter()
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [quota, setQuota] = useState<{ usedBytes: number; limitBytes: number } | null>(null)
  const xhrRef = useRef<XMLHttpRequest | null>(null)

  useEffect(() => {
    userBooksApi.getStorageQuota()
      .then(setQuota)
      .catch(() => {})
  }, [])

  const pickAndUpload = async () => {
    setError(null)
    setUploadProgress(0)
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

      const { baseUrl, getAccessToken } = getApiConfig()
      const token = await getAccessToken()

      const formData = new FormData()
      formData.append('file', {
        uri: file.uri,
        name: file.name,
        type: file.mimeType || 'application/octet-stream',
      } as any)

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhrRef.current = xhr
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadProgress((e.loaded / e.total) * 100)
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error(`Upload failed (${xhr.status})`))
        }
        xhr.onerror = () => reject(new Error('Upload failed'))
        xhr.open('POST', `${baseUrl}/me/books/upload`)
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        xhr.send(formData)
      })

      router.back()
    } catch (e: any) {
      setError(e?.message || 'Upload failed')
    } finally {
      setUploading(false)
      xhrRef.current = null
    }
  }

  const usedPercent = quota && quota.limitBytes > 0
    ? Math.min((quota.usedBytes / quota.limitBytes) * 100, 100)
    : 0

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Upload Book' }} />
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Upload a Book</Text>
          <Text style={styles.subtitle}>Supported formats: EPUB, PDF, FB2</Text>

          {quota && (
            <View style={styles.quotaBox}>
              <View style={styles.quotaBar}>
                <View style={[styles.quotaFill, { width: `${usedPercent}%` as any }]} />
              </View>
              <Text style={styles.quotaText}>
                {formatBytes(quota.usedBytes)} / {formatBytes(quota.limitBytes)} used
              </Text>
            </View>
          )}

          {uploading ? (
            <View style={styles.uploadingBox}>
              <View style={styles.uploadProgressBar}>
                <View style={[styles.uploadProgressFill, { width: `${Math.round(uploadProgress)}%` as any }]} />
              </View>
              <Text style={styles.uploadingText}>{Math.round(uploadProgress)}% uploading {fileName}...</Text>
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
  quotaBox: { alignItems: 'center', marginBottom: 24, width: '100%', maxWidth: 240 },
  quotaBar: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textSecondary + '33',
    overflow: 'hidden',
    marginBottom: 6,
  },
  quotaFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 2 },
  quotaText: { fontSize: 12, color: colors.textSecondary },
  pickBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
  },
  pickBtnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  uploadingBox: { alignItems: 'center', gap: 12, width: '100%', maxWidth: 280 },
  uploadProgressBar: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.textSecondary + '33',
    overflow: 'hidden',
  },
  uploadProgressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
  uploadingText: { fontSize: 14, color: colors.textSecondary },
  error: { color: '#DC2626', fontSize: 14, marginTop: 16, textAlign: 'center' },
})
