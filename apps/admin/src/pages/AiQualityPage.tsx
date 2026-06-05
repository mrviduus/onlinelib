import { useState, useEffect } from 'react'
import { adminApi, AiQualitySummary, FeatureSummary, DailyCostPoint } from '../api/client'

const RANGES = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
]

export function AiQualityPage() {
  const [data, setData] = useState<AiQualitySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(30)

  useEffect(() => {
    setLoading(true)
    const from = new Date(Date.now() - days * 86400000).toISOString()
    adminApi
      .getAiQualitySummary({ from })
      .then((d) => {
        setData(d)
        setError(null)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [days])

  return (
    <div className="dashboard-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h1>AI Quality</h1>
        <div style={{ display: 'flex', gap: 4 }}>
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid #d1d5db',
                background: days === r.days ? '#2563eb' : '#fff',
                color: days === r.days ? '#fff' : '#374151',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <p className="dashboard-page__subtitle">
        Per-feature cost, latency and error rate from sampled LLM traces. Judge-score trends arrive once eval runs persist.
      </p>

      {error && (
        <div style={{ background: '#fef2f2', color: '#b91c1c', padding: 12, borderRadius: 8, margin: '12px 0' }}>{error}</div>
      )}

      {loading ? (
        <p className="dashboard-page__subtitle">Loading…</p>
      ) : !data || data.features.length === 0 ? (
        <p className="dashboard-empty" style={{ marginTop: 24 }}>
          No LLM traces in this window yet. Traces are sampled, so metrics appear once the app makes AI calls.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 24, margin: '16px 0' }}>
            <Totals label="Total calls" value={data.totalCalls.toLocaleString()} />
            <Totals label="Total cost" value={`$${data.totalCostUsd.toFixed(2)}`} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {data.features.map((f) => (
              <FeatureCard key={f.featureTag} f={f} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Totals({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#111827' }}>{value}</div>
      <div style={{ fontSize: 13, color: '#6b7280' }}>{label}</div>
    </div>
  )
}

function FeatureCard({ f }: { f: FeatureSummary }) {
  const errPct = (f.errorRate * 100).toFixed(1)
  const errColor = f.errorRate > 0.05 ? '#dc2626' : f.errorRate > 0 ? '#d97706' : '#059669'
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 600, fontSize: 15, color: '#111827' }}>{f.featureTag}</span>
        <span style={{ fontSize: 12, color: '#6b7280' }}>{f.calls.toLocaleString()} calls</span>
      </div>
      <Sparkline points={f.dailyCost} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', marginTop: 12 }}>
        <Metric label="Cost" value={`$${f.costUsd.toFixed(4)}`} />
        <Metric label="Cost/day" value={`$${f.costPerDay.toFixed(4)}`} />
        <Metric label="p50 latency" value={`${f.p50LatencyMs} ms`} />
        <Metric label="p95 latency" value={`${f.p95LatencyMs} ms`} />
        <Metric label="Error rate" value={`${errPct}%`} color={errColor} />
        <Metric label="Tokens (in/out)" value={`${f.tokensIn.toLocaleString()} / ${f.tokensOut.toLocaleString()}`} />
      </div>
    </div>
  )
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, color: color ?? '#111827' }}>{value}</div>
      <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
    </div>
  )
}

function Sparkline({ points }: { points: DailyCostPoint[] }) {
  const w = 248
  const h = 36
  const pad = 2
  if (points.length < 2) return <div style={{ height: h, color: '#d1d5db', fontSize: 12 }}>—</div>
  const vals = points.map((p) => p.costUsd)
  const max = Math.max(...vals)
  const min = Math.min(...vals)
  const range = max - min || 1
  const step = (w - pad * 2) / (points.length - 1)
  const coords = points
    .map((p, i) => `${(pad + i * step).toFixed(1)},${(h - pad - ((p.costUsd - min) / range) * (h - pad * 2)).toFixed(1)}`)
    .join(' ')
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={coords} fill="none" stroke="#2563eb" strokeWidth="1.5" />
    </svg>
  )
}
