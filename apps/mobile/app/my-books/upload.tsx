import { useState, useEffect, useRef } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native'
import { useRouter, Stack } from 'expo-router'
import * as DocumentPicker from 'expo-document-picker'
import { userBooksApi, getApiConfig } from '@textstack/shared'
import { colors } from '../../src/theme/colors'
import { trackBookUploaded } from '../../src/lib/analytics'

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
  const unmountedRef = useRef(false)

  useEffect(() => {
    userBooksApi.getStorageQuota()
      .then(setQuota)
      .catch(err => console.warn('getStorageQuota failed:', err))
  }, [])

  // Abort any in-flight upload on unmount so the user doesn't silently
  // consume bandwidth after navigating away, and so a subsequent retry
  // doesn't race the abandoned request (P1-3).
  useEffect(() => {
    return () => {
      unmountedRef.current = true
      if (xhrRef.current) {
        try { xhrRef.current.abort() } catch {}
        xhrRef.current = null
      }
    }
  }, [])

  /** Map HTTP status to user-visible copy so errors are actionable (P3-3). */
  const uploadErrorMessage = (status: number): string => {
    if (status === 413) return 'File is too large. Try a smaller book.'
    if (status === 415) return 'Unsupported file format. Use EPUB, PDF, or FB2.'
    if (status === 400) return 'This file looks invalid. Try another one.'
    if (status === 401 || status === 403) return 'Sign in to upload books.'
    if (status === 429) return 'Too many uploads. Take a breather and retry.'
    if (status >= 500) return 'Server error. Try again in a bit.'
    return `Upload failed (${status}).`
  }

  const handleCancel = () => {
    if (xhrRef.current) {
      try { xhrRef.current.abort() } catch {}
      xhrRef.current = null
    }
    setUploading(false)
    setUploadProgress(0)
    setFileName(null)
  }

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
          else {
            const err = new Error(uploadErrorMessage(xhr.status)) as Error & { status?: number }
            err.status = xhr.status
            reject(err)
          }
        }
        xhr.onerror = () => reject(new Error('Network error — check your connection.'))
        // `onabort` fires when we call xhr.abort() (unmount / Cancel button).
        // We surface a distinct error type so the finally-block and the UI
        // can tell "user cancelled" apart from a real failure.
        xhr.onabort = () => {
          const err = new Error('Upload cancelled') as Error & { aborted?: boolean }
          err.aborted = true
          reject(err)
        }
        xhr.open('POST', `${baseUrl}/me/books/upload`)
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        xhr.send(formData)
      })

      if (unmountedRef.current) return
      const format = file.name.split('.').pop()?.toLowerCase() || 'unknown'
      trackBookUploaded({ format, sizeBytes: file.size ?? 0 })
      router.back()
    } catch (e: any) {
      if (unmountedRef.current) return
      // Cancellation is an intentional user action — don't show an error
      // banner, just reset state.
      if (e?.aborted) return
      setError(e?.message || 'Upload failed')
    } finally {
      if (!unmountedRef.current) setUploading(false)
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
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={handleCancel}
                accessibilityLabel="Cancel upload"
                accessibilityRole="button"
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.pickBtn}
              onPress={pickAndUpload}
              accessibilityLabel="Choose file to upload"
              accessibilityRole="button"
            >
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
  cancelBtn: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.textSecondary + '66',
  },
  cancelBtnText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  error: { color: '#DC2626', fontSize: 14, marginTop: 16, textAlign: 'center' },
})
