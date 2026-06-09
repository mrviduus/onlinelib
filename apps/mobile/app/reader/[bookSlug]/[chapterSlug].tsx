import { useLocalSearchParams } from 'expo-router'
import { useAuth } from '../../../src/context/AuthContext'
import { useLanguage } from '../../../src/context/LanguageContext'
import { useToast } from '../../../src/context/ToastContext'
import { Reader } from '../../../src/components/reader/Reader'
import { useEditionReaderSource } from '../../../src/components/reader/useEditionReaderSource'

/**
 * Public-library reader route. Thin wrapper: builds the catalog (edition)
 * runtime and hands it to the shared <Reader>. All reader logic lives in the
 * source hook + <Reader> + <ReaderShell> — one code path shared with the
 * user-book reader.
 */
export default function ReaderScreen() {
  const { bookSlug, chapterSlug } = useLocalSearchParams<{ bookSlug: string; chapterSlug: string }>()
  const { isAuthenticated } = useAuth()
  const { language } = useLanguage()
  const { show: showToast } = useToast()

  const runtime = useEditionReaderSource({
    bookSlug: bookSlug ?? '',
    chapterSlug: chapterSlug ?? '',
    language,
    isAuthenticated,
    showToast,
  })

  return <Reader runtime={runtime} />
}
