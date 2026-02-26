import { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { userBooksApi, getStorageUrl } from '@textstack/shared'
import type { UserBookDto } from '@textstack/shared'
import { colors } from '../../src/theme/colors'

export default function UserBookDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const [book, setBook] = useState<UserBookDto | null>(null)
  const [chapters, setChapters] = useState<{ slug: string; title: string }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    ;(async () => {
      try {
        const b = await userBooksApi.getUserBook(id)
        setBook(b)
        // Fetch first chapter to get nav info — we'll use the chapter list from book detail
        // For now, show basic info
      } catch (e) {
        console.error('Failed to load user book:', e)
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  if (loading || !book) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <>
      <Stack.Screen options={{ title: book.title || 'My Book', headerShown: true }} />
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <Image
            source={book.coverPath ? getStorageUrl(book.coverPath) : undefined}
            style={styles.cover}
            contentFit="cover"
          />
          <View style={styles.meta}>
            <Text style={styles.title}>{book.title || 'Untitled'}</Text>
            {book.author && <Text style={styles.author}>{book.author}</Text>}
            <Text style={styles.info}>{book.chapterCount} chapters</Text>
            <StatusText status={book.status} />
          </View>
        </View>

        {book.status === 'completed' && book.chapterCount > 0 && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.readBtn}
              onPress={() => router.push(`/my-books/read/${id}/chapter-1`)}
            >
              <Text style={styles.readBtnText}>Start Reading</Text>
            </TouchableOpacity>
          </View>
        )}

        {book.status === 'failed' && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={async () => {
                await userBooksApi.retryUserBook(id!)
                setBook({ ...book, status: 'processing' })
              }}
            >
              <Text style={styles.retryBtnText}>Retry Processing</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </>
  )
}

function StatusText({ status }: { status: UserBookDto['status'] }) {
  if (status === 'completed') return <Text style={styles.statusOk}>Ready</Text>
  if (status === 'failed') return <Text style={styles.statusFail}>Failed</Text>
  return <Text style={styles.statusPending}>Processing...</Text>
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', padding: 16 },
  cover: { width: 100, height: 150, borderRadius: 8, backgroundColor: colors.border },
  meta: { flex: 1, marginLeft: 16, justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  author: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
  info: { fontSize: 13, color: colors.textSecondary, marginTop: 6 },
  actions: { paddingHorizontal: 16, marginTop: 8, gap: 8 },
  readBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  readBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  retryBtn: {
    backgroundColor: '#FEF3C7',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  retryBtnText: { fontSize: 14, color: '#92400E', fontWeight: '500' },
  statusOk: { fontSize: 12, color: '#059669', marginTop: 6, fontWeight: '500' },
  statusFail: { fontSize: 12, color: '#DC2626', marginTop: 6, fontWeight: '500' },
  statusPending: { fontSize: 12, color: colors.primary, marginTop: 6, fontWeight: '500' },
})
