import { Text, StyleSheet } from 'react-native'
import type { StyleProp, TextStyle } from 'react-native'
import { anchorContextSnippet } from '@textstack/shared'
import { useTheme } from '../context/ThemeContext'
import { fonts } from '../theme/typography'

/**
 * A saved highlight, shown with the text it was taken from.
 *
 * QA highlighted a single word and every screen rendered it as `"in"` — the reader sheet, the
 * Highlights list and the review card all printed `selectedText` alone. Nothing about that quote
 * could remind anyone why they saved it. The vocabulary list had the same problem and solved it a day
 * earlier by showing the sentence with the word emphasised; this is that treatment, for highlights.
 *
 * The context did not have to be captured — it was already there. A reflow highlight stores a
 * {prefix, exact, suffix} anchor with ~30 characters of the real page on each side, so every existing
 * highlight gains its context retroactively; two API projections were simply dropping the field.
 *
 * PDF-rect highlights and the old no-anchor path carry no surroundings, and there is no recovering
 * them. Those render as the passage alone rather than as an empty frame with nothing in it.
 */
export function HighlightQuote({
  anchorJson,
  selectedText,
  numberOfLines = 4,
  style,
}: {
  anchorJson?: string | null
  selectedText: string
  numberOfLines?: number
  style?: StyleProp<TextStyle>
}) {
  const { colors } = useTheme()
  const snippet = anchorContextSnippet(anchorJson, selectedText)

  if (!snippet) {
    return (
      <Text style={[styles.quote, { color: colors.text }, style]} numberOfLines={numberOfLines}>
        "{selectedText}"
      </Text>
    )
  }

  // The context is dimmed and the passage is not: the reader saved the passage, and it has to stay
  // the thing the eye lands on even when it is one word inside a line of ordinary prose.
  return (
    <Text style={[styles.quote, { color: colors.textSecondary }, style]} numberOfLines={numberOfLines}>
      {snippet.before ? '…' + snippet.before : ''}
      <Text style={{ fontFamily: fonts.serifBold, fontStyle: 'normal', color: colors.text }}>
        {snippet.match}
      </Text>
      {snippet.after ? snippet.after + '…' : ''}
    </Text>
  )
}

const styles = StyleSheet.create({
  quote: { fontFamily: fonts.serif, fontSize: 14, lineHeight: 20, fontStyle: 'italic' },
})
