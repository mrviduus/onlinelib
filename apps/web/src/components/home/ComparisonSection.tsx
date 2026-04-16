import { useTranslation } from '../../hooks/useTranslation'

const FEATURES = [
  'tapTranslate',
  'srsCards',
  'uploadBooks',
  'tts',
  'offline',
  'stats',
  'free',
] as const

const COMPETITORS = ['textstack', 'lingq', 'kindle', 'speechify'] as const

type Status = 'yes' | 'no' | 'partial'

const DATA: Record<string, Record<string, Status>> = {
  tapTranslate:  { textstack: 'yes', lingq: 'yes', kindle: 'partial', speechify: 'no' },
  srsCards:      { textstack: 'yes', lingq: 'yes', kindle: 'no', speechify: 'no' },
  uploadBooks:   { textstack: 'yes', lingq: 'yes', kindle: 'no', speechify: 'yes' },
  tts:           { textstack: 'yes', lingq: 'no', kindle: 'no', speechify: 'yes' },
  offline:       { textstack: 'yes', lingq: 'partial', kindle: 'yes', speechify: 'yes' },
  stats:         { textstack: 'yes', lingq: 'partial', kindle: 'no', speechify: 'no' },
  free:          { textstack: 'yes', lingq: 'no', kindle: 'no', speechify: 'no' },
}

function StatusIcon({ status }: { status: Status }) {
  if (status === 'yes') return <span className="home-comparison__icon home-comparison__icon--yes" aria-label="Yes">✓</span>
  if (status === 'partial') return <span className="home-comparison__icon home-comparison__icon--partial" aria-label="Partial">~</span>
  return <span className="home-comparison__icon home-comparison__icon--no" aria-label="No">✗</span>
}

export function ComparisonSection() {
  const { t } = useTranslation()

  return (
    <section className="home-comparison" aria-labelledby="home-comparison-heading">
      <div className="home-comparison__inner">
        <h2 className="home-comparison__heading" id="home-comparison-heading">
          {t('home.comparison.heading')}
        </h2>
        <p className="home-comparison__subheading">{t('home.comparison.subheading')}</p>

        <div className="home-comparison__table-wrap">
          <table className="home-comparison__table">
            <thead>
              <tr>
                <th className="home-comparison__feature-col">{t('home.comparison.feature')}</th>
                {COMPETITORS.map(c => (
                  <th key={c} className={`home-comparison__competitor-col${c === 'textstack' ? ' home-comparison__competitor-col--highlight' : ''}`}>
                    {t(`home.comparison.competitors.${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FEATURES.map(f => (
                <tr key={f}>
                  <td className="home-comparison__feature-name">{t(`home.comparison.features.${f}`)}</td>
                  {COMPETITORS.map(c => (
                    <td key={c} className={c === 'textstack' ? 'home-comparison__cell--highlight' : ''}>
                      <StatusIcon status={DATA[f][c]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
