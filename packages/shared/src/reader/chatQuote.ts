// "Quote-and-ask" codec for the persistent Book Chat (ChatPDF/Claude pattern). Shared by web
// (apps/web/src/api/bookChat.ts re-exports these) and mobile (AskSheet). Pure + platform-agnostic
// so the SERVER contract stays plain `question: string` — a quoted passage is prepended to the
// question as a markdown blockquote, and persisted history round-trips the card on reload.

/**
 * Encodes a quoted passage + question into a single `question` string: each passage line becomes a
 * `> `-prefixed blockquote line, then a blank separator, then the question. No schema change — the
 * server stores the composed string and {@link parseQuotedContent} splits it back for rendering.
 */
export function composeQuotedQuestion(passage: string, question: string): string {
  const quoted = passage
    .split('\n')
    .map(line => (line ? `> ${line}` : '>'))
    .join('\n')
  return `${quoted}\n\n${question}`
}

/**
 * Inverse of {@link composeQuotedQuestion}: splits a user message into its leading blockquote
 * (rendered as a styled quote card) and the remaining question text. Only treats a message as a
 * quote card when it matches the EXACT shape {@link composeQuotedQuestion} emits — one-or-more
 * leading `> `-prefixed lines, a single BLANK separator line, then a NON-EMPTY question remainder.
 * Anything else (a plain `> 5 means greater`, or a blockquote with no question) is returned as-is
 * plain text so a legitimate `>`-leading question isn't hijacked into an empty quote card.
 */
export function parseQuotedContent(content: string): { quote: string | null; text: string } {
  const plain = { quote: null, text: content }
  if (!content.startsWith('>')) return plain
  const lines = content.split('\n')
  const quoteLines: string[] = []
  let i = 0
  for (; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('> ')) quoteLines.push(line.slice(2))
    else if (line === '>') quoteLines.push('')
    else break
  }
  // Require: at least one quote line, a blank-line separator, and a non-empty question remainder.
  if (quoteLines.length === 0 || lines[i] !== '') return plain
  const text = lines.slice(i + 1).join('\n')
  if (text === '') return plain
  return { quote: quoteLines.join('\n'), text }
}
