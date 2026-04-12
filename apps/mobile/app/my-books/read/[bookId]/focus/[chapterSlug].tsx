import { Stack, useLocalSearchParams } from 'expo-router'
import { FocusReader } from '../../../../../src/components/focus/FocusReader'

export default function FocusReaderUserBookScreen() {
  const { bookId, chapterSlug } = useLocalSearchParams<{ bookId: string; chapterSlug: string }>()

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <FocusReader mode="userbook" bookId={bookId} chapterSlug={chapterSlug} />
    </>
  )
}
