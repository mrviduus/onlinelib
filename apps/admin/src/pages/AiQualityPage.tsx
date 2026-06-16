import { useState, useEffect, CSSProperties } from 'react'
import {
  adminApi,
  AiQualitySummary,
  FeatureSummary,
  DailyCostPoint,
  TraceListItem,
  TraceDetail,
  EvalRun,
  CriticDefectEvalResult,
} from '../api/client'

type Tab = 'summary' | 'traces' | 'evals'

const KNOWN_FEATURES = ['explain', 'translate', 'distractor', 'bookmeta', 'tagsuggestion', 'eval.judge']

export function AiQualityPage() {
  const [tab, setTab] = useState<Tab>('summary')
  return (
    <div className="dashboard-page">
      <h1>AI Quality</h1>
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e5e7eb', margin: '12px 0 16px' }}>
        {(['summary', 'traces', 'evals'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderBottom: tab === t ? '2px solid #2563eb' : '2px solid transparent',
              background: 'none',
              color: tab === t ? '#2563eb' : '#6b7280',
              fontWeight: tab === t ? 600 : 400,
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'summary' && <SummaryTab />}
      {tab === 'traces' && <TracesTab />}
      {tab === 'evals' && <EvalsTab />}
    </div>
  )
}

// ─────────────────────────── Summary ───────────────────────────

const RANGES = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
]

function SummaryTab() {
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
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <p className="dashboard-page__subtitle" style={{ margin: 0 }}>
          Per-feature cost, latency and error rate from sampled LLM traces.
        </p>
        <div style={{ display: 'flex', gap: 4 }}>
          {RANGES.map((r) => (
            <button key={r.days} onClick={() => setDays(r.days)} style={rangeBtn(days === r.days)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && <Banner text={error} />}

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
    </>
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
    <div style={card}>
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
        {f.latestEvalScore != null && (
          <Metric label="Eval score" value={`${f.latestEvalScore.toFixed(2)} / 5`} color="#7c3aed" />
        )}
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

// ─────────────────────────── Traces ───────────────────────────

const PAGE = 50

function TracesTab() {
  const [items, setItems] = useState<TraceListItem[]>([])
  const [total, setTotal] = useState(0)
  const [feature, setFeature] = useState('')
  const [q, setQ] = useState('')
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<TraceDetail | null>(null)

  useEffect(() => {
    setLoading(true)
    adminApi
      .getAiTraces({ feature: feature || undefined, q: q || undefined, limit: PAGE, offset })
      .then((d) => {
        setItems(d.items)
        setTotal(d.total)
        setError(null)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [feature, q, offset])

  const openTrace = async (id: string) => {
    try {
      setSelected(await adminApi.getAiTrace(id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load trace')
    }
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <select
          value={feature}
          onChange={(e) => {
            setOffset(0)
            setFeature(e.target.value)
          }}
          style={input}
        >
          <option value="">All features</option>
          {KNOWN_FEATURES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <input
          placeholder="Search prompt / response…"
          defaultValue={q}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setOffset(0)
              setQ((e.target as HTMLInputElement).value)
            }
          }}
          style={{ ...input, flex: 1, minWidth: 200 }}
        />
      </div>

      {error && <Banner text={error} />}

      {loading ? (
        <p className="dashboard-page__subtitle">Loading…</p>
      ) : items.length === 0 ? (
        <p className="dashboard-empty">No traces match. (Traces are sampled and only appear after AI calls.)</p>
      ) : (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
                <th style={th}>Feature</th>
                <th style={th}>Model</th>
                <th style={th}>Cost</th>
                <th style={th}>Latency</th>
                <th style={th}>Tokens</th>
                <th style={th}>When</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => openTrace(t.id)}
                  style={{ cursor: 'pointer', borderBottom: '1px solid #f3f4f6', background: t.hasError ? '#fef2f2' : undefined }}
                >
                  <td style={td}>{t.featureTag}{t.hasError && <span style={{ color: '#dc2626' }}> ⚠</span>}</td>
                  <td style={td}>{t.modelId}</td>
                  <td style={td}>${t.costUsd.toFixed(4)}</td>
                  <td style={td}>{t.latencyMs} ms</td>
                  <td style={td}>{t.tokensIn}/{t.tokensOut}</td>
                  <td style={td}>{timeAgo(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager offset={offset} total={total} onChange={setOffset} />
        </>
      )}

      {selected && <TraceModal trace={selected} onClose={() => setSelected(null)} />}
    </>
  )
}

function TraceModal({ trace, onClose }: { trace: TraceDetail; onClose: () => void }) {
  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={modal}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{trace.featureTag}</h2>
          <button onClick={onClose} style={{ ...rangeBtn(false), border: 'none' }}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
          {trace.modelId} · ${trace.costUsd.toFixed(4)} · {trace.latencyMs} ms · {trace.tokensIn}/{trace.tokensOut} tok · {new Date(trace.createdAt).toLocaleString()}
        </div>
        {trace.error && <Banner text={trace.error} />}
        <Section title="System prompt" body={trace.systemPrompt} />
        <Section title="Messages" body={pretty(trace.messagesJson)} />
        <Section title="Response" body={trace.responseText} />
        {trace.toolCallsJson && <Section title="Tool calls" body={pretty(trace.toolCallsJson)} />}
      </div>
    </div>
  )
}

function Section({ title, body }: { title: string; body: string | null }) {
  if (!body) return null
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#9ca3af', marginBottom: 4 }}>{title}</div>
      <pre style={pre}>{body}</pre>
    </div>
  )
}

// ─────────────────────────── Evals ───────────────────────────

function EvalsTab() {
  const [runs, setRuns] = useState<EvalRun[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [judge, setJudge] = useState<'ollama' | 'openai'>('ollama')
  const [running, setRunning] = useState(false)
  const [criticRunning, setCriticRunning] = useState(false)
  const [criticResult, setCriticResult] = useState<CriticDefectEvalResult | null>(null)

  const load = () =>
    adminApi
      .getAiEvals({ limit: 500 })
      .then((d) => {
        setRuns(d)
        setError(null)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))

  useEffect(() => {
    load().finally(() => setLoading(false))
    let prev = false
    const poll = setInterval(async () => {
      try {
        const st = await adminApi.getAiEvalStatus()
        setRunning(st.running)
        if (st.lastError) setError(st.lastError)
        if (prev && !st.running) load() // finished → refresh history
        prev = st.running
      } catch {
        /* ignore poll errors */
      }
    }, 3000)
    return () => clearInterval(poll)
  }, [])

  const run = async () => {
    setError(null)
    try {
      await adminApi.runAiEvals({ judge })
      setRunning(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start run')
    }
  }

  const runCriticDefect = async () => {
    setError(null)
    setCriticRunning(true)
    try {
      setCriticResult(await adminApi.runCriticDefectEval())
      load() // persisted as an eval_run → refresh history
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to run critic-defect eval')
    } finally {
      setCriticRunning(false)
    }
  }

  const controls = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={judge} onChange={(e) => setJudge(e.target.value as 'ollama' | 'openai')} style={input} disabled={running}>
          <option value="ollama">Judge: Ollama (free)</option>
          <option value="openai">Judge: OpenAI (gpt-4.1)</option>
        </select>
        <button onClick={run} disabled={running} style={rangeBtn(false)}>
          {running ? 'Running…' : 'Run evals'}
        </button>
        <span style={{ fontSize: 12, color: '#6b7280' }}>
          Runs all goldens through the real gateway and writes eval history.
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={runCriticDefect} disabled={criticRunning} style={rangeBtn(false)}>
          {criticRunning ? 'Running…' : 'Run critic-defect eval'}
        </button>
        <span style={{ fontSize: 12, color: '#6b7280' }}>
          Injects known defects into clean drafts, runs the real nano critic (~23 calls, 20–30s), gate ≥ 0.80 catch-rate.
        </span>
      </div>
      {criticResult && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontWeight: 600, fontSize: 15, color: '#111827' }}>Critic-defect eval</span>
            <span style={{ fontWeight: 600, fontSize: 13, color: criticResult.passed ? '#059669' : '#dc2626' }}>
              {criticResult.passed ? 'PASS' : 'FAIL'}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px 12px' }}>
            <Metric
              label="Catch rate"
              value={`${(criticResult.catchRate * 100).toFixed(1)}%`}
              color={criticResult.passed ? '#059669' : '#dc2626'}
            />
            <Metric label="False-positive rate" value={`${(criticResult.falsePositiveRate * 100).toFixed(1)}%`} />
            <Metric label="N" value={String(criticResult.n)} />
          </div>
        </div>
      )}
    </div>
  )

  // Group by feature (API returns newest-first), then flag regressions vs the next-older run.
  const byFeature = new Map<string, EvalRun[]>()
  for (const r of runs) {
    const arr = byFeature.get(r.feature) ?? []
    arr.push(r)
    byFeature.set(r.feature, arr)
  }

  return (
    <>
      {controls}
      {error && <Banner text={error} />}
      {loading ? (
        <p className="dashboard-page__subtitle">Loading…</p>
      ) : runs.length === 0 ? (
        <p className="dashboard-empty">No eval runs yet. Click “Run evals” to populate (judge defaults to free local Ollama).</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {[...byFeature.entries()].map(([feature, fRuns]) => (
        <div key={feature}>
          <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>{feature}</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
                <th style={th}>Score</th>
                <th style={th}>Breakdown</th>
                <th style={th}>Model</th>
                <th style={th}>Judge</th>
                <th style={th}>N</th>
                <th style={th}>When</th>
              </tr>
            </thead>
            <tbody>
              {fRuns.map((r, i) => {
                const prev = fRuns[i + 1]
                const regressed = prev && r.score < prev.score - 0.1
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ ...td, fontWeight: 600, color: regressed ? '#dc2626' : '#111827' }}>
                      {r.score.toFixed(2)}
                      {regressed && <span title={`down from ${prev!.score.toFixed(2)}`}> ▼</span>}
                    </td>
                    <td style={td}>{formatBreakdown(r.breakdownJson)}</td>
                    <td style={td}>{r.modelId}</td>
                    <td style={td}>{r.judgeModelId}</td>
                    <td style={td}>{r.n}</td>
                    <td style={td}>{timeAgo(r.createdAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
          ))}
        </div>
      )}
    </>
  )
}

// ─────────────────────────── shared ───────────────────────────

function Pager({ offset, total, onChange }: { offset: number; total: number; onChange: (o: number) => void }) {
  const page = Math.floor(offset / PAGE) + 1
  const pages = Math.max(1, Math.ceil(total / PAGE))
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, fontSize: 13, color: '#6b7280' }}>
      <button disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - PAGE))} style={rangeBtn(false)}>
        ← Prev
      </button>
      <span>
        Page {page} / {pages} · {total} traces
      </span>
      <button disabled={offset + PAGE >= total} onClick={() => onChange(offset + PAGE)} style={rangeBtn(false)}>
        Next →
      </button>
    </div>
  )
}

function Banner({ text }: { text: string }) {
  return <div style={{ background: '#fef2f2', color: '#b91c1c', padding: 12, borderRadius: 8, margin: '12px 0' }}>{text}</div>
}

function formatBreakdown(json: string | null): string {
  if (!json) return '—'
  try {
    const obj = JSON.parse(json) as Record<string, number>
    return Object.entries(obj)
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ')
  } catch {
    return json
  }
}

function pretty(json: string): string {
  try {
    return JSON.stringify(JSON.parse(json), null, 2)
  } catch {
    return json
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

const card: CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, background: '#fff' }
const input: CSSProperties = { padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }
const th: CSSProperties = { padding: '8px 10px', fontWeight: 600 }
const td: CSSProperties = { padding: '8px 10px' }
const overlay: CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex',
  alignItems: 'flex-start', justifyContent: 'center', padding: 40, zIndex: 50, overflow: 'auto',
}
const modal: CSSProperties = { background: '#fff', borderRadius: 12, padding: 20, maxWidth: 760, width: '100%' }
const pre: CSSProperties = {
  background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, padding: 10,
  fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 280, overflow: 'auto', margin: 0,
}

function rangeBtn(active: boolean): CSSProperties {
  return {
    padding: '6px 12px', borderRadius: 6, border: '1px solid #d1d5db',
    background: active ? '#2563eb' : '#fff', color: active ? '#fff' : '#374151',
    cursor: 'pointer', fontSize: 13,
  }
}
