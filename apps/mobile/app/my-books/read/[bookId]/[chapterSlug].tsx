import { useLocalSearchParams } from 'expo-router'
import { useToast } from '../../../../src/context/ToastContext'
import { Reader } from '../../../../src/components/reader/Reader'
import { useUserBookReaderSource } from '../../../../src/components/reader/useUserBookReaderSource'

/**
 * User-uploaded book reader route. Thin wrapper: builds the user-book runtime
 * and hands it to the shared <Reader>. Identical code path to the catalog
 * reader — the only difference (data fetch + progress I/O) lives behind the
 * source hook.
 */
export default function UserBookReaderScreen() {
  const { bookId, chapterSlug } = useLocalSearchParams<{ bookId: string; chapterSlug: string }>()
  const { show: showToast } = useToast()

  const runtime = useUserBookReaderSource({
    bookId: bookId ?? '',
    chapterSlug: chapterSlug ?? '',
    showToast,
  })

  return <Reader runtime={runtime} />
}
