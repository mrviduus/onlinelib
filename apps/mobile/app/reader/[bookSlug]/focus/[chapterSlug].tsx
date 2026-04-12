import { Stack, useLocalSearchParams } from 'expo-router'
import { FocusReader } from '../../../../src/components/focus/FocusReader'

export default function FocusReaderPublicScreen() {
  const { bookSlug, chapterSlug } = useLocalSearchParams<{ bookSlug: string; chapterSlug: string }>()

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <FocusReader mode="public" bookSlug={bookSlug} chapterSlug={chapterSlug} />
    </>
  )
}
