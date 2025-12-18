import type { ReaderSettings } from '../../hooks/useReaderSettings'
import { getColumnMaxWidth } from '../../hooks/useReaderSettings'

interface Props {
  html: string
  settings: ReaderSettings
  onTap: () => void
}

export function ReaderContent({ html, settings, onTap }: Props) {
  const fontFamily = settings.fontFamily === 'serif'
    ? 'Georgia, "Times New Roman", serif'
    : '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'

  return (
    <article
      className="reader-content"
      onClick={onTap}
      style={{
        maxWidth: getColumnMaxWidth(settings.columnWidth),
        fontSize: `${settings.fontSize}px`,
        lineHeight: settings.lineHeight,
        fontFamily,
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
