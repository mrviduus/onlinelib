interface Props {
  kind: 'lookup' | 'lookup_pending'
  tapsRemaining: number | null
  busy: boolean
  onAddAnyway: () => void
  t: (key: string, params?: Record<string, string | number>) => string
}

export function RareWordNotice({ kind, tapsRemaining, busy, onAddAnyway, t }: Props) {
  const title = kind === 'lookup_pending' && tapsRemaining != null && tapsRemaining > 0
    ? t('reader.vocab.tapAgainToStudy', { n: tapsRemaining })
    : t('reader.rareWordNotice.title')

  return (
    <div className="rare-word-notice" role="note">
      <div className="rare-word-notice__title">{title}</div>
      <div className="rare-word-notice__body">{t('reader.rareWordNotice.body')}</div>
      <button
        type="button"
        className={`rare-word-notice__cta${busy ? ' rare-word-notice__cta--busy' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onAddAnyway}
        disabled={busy}
        aria-busy={busy}
      >
        {busy ? t('reader.rareWordNotice.ctaBusy') : t('reader.rareWordNotice.cta')}
      </button>
    </div>
  )
}
