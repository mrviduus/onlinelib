import { useEffect, useState } from 'react'
import { adminApi, SeoCoverageStat, SeoTemplateListItem, SeoBackfillJobListItem, SeoBackfillSettings } from '../api/client'

type Tab = 'coverage' | 'templates' | 'jobs' | 'settings'

export function SeoBackfillPage() {
  const [tab, setTab] = useState<Tab>('coverage')

  return (
    <div>
      <h1>SEO Backfill</h1>
      <p style={{ color: '#666' }}>
        Automate SEO field generation for Authors, Editions, Genres, and Blog posts using Claude CLI templates.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', margin: '1rem 0', borderBottom: '1px solid #ddd' }}>
        {(['coverage', 'templates', 'jobs', 'settings'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? '#eef' : 'transparent',
              border: 'none',
              borderBottom: tab === t ? '2px solid #55d' : '2px solid transparent',
              padding: '0.5rem 1rem',
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'coverage' && <CoverageTab />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'jobs' && <JobsTab />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  )
}

function CoverageTab() {
  const [stats, setStats] = useState<SeoCoverageStat[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    adminApi.getSeoCoverage().then(setStats).catch(e => setError(String(e)))
  }, [])

  if (error) return <div style={{ color: 'red' }}>{error}</div>
  if (!stats) return <div>Loading…</div>

  const grouped = stats.reduce<Record<string, SeoCoverageStat[]>>((acc, s) => {
    (acc[s.entityType] ??= []).push(s)
    return acc
  }, {})

  return (
    <div>
      {Object.entries(grouped).map(([entity, rows]) => (
        <div key={entity} style={{ marginBottom: '1.5rem' }}>
          <h3>{entity}</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #ddd' }}>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Field</th>
                <th style={{ textAlign: 'right', padding: '0.5rem' }}>Populated</th>
                <th style={{ textAlign: 'right', padding: '0.5rem' }}>Missing</th>
                <th style={{ textAlign: 'right', padding: '0.5rem' }}>Total</th>
                <th style={{ textAlign: 'left', padding: '0.5rem', width: '40%' }}>Coverage</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const pct = r.total === 0 ? 0 : Math.round((r.populated / r.total) * 100)
                return (
                  <tr key={r.fieldType} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '0.5rem' }}>{r.fieldType}</td>
                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>{r.populated}</td>
                    <td style={{ padding: '0.5rem', textAlign: 'right', color: r.missing > 0 ? '#c33' : '#3a3' }}>{r.missing}</td>
                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>{r.total}</td>
                    <td style={{ padding: '0.5rem' }}>
                      <div style={{ background: '#eee', borderRadius: 3, height: 14, position: 'relative' }}>
                        <div style={{ background: pct > 80 ? '#3a3' : pct > 40 ? '#ea0' : '#c33', width: `${pct}%`, height: '100%', borderRadius: 3 }} />
                        <span style={{ position: 'absolute', left: 6, top: -1, fontSize: 11, color: '#222' }}>{pct}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

function TemplatesTab() {
  const [templates, setTemplates] = useState<SeoTemplateListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    adminApi.getSeoTemplates({ onlyActive: true }).then(setTemplates).catch(e => setError(String(e)))
  }, [])

  if (error) return <div style={{ color: 'red' }}>{error}</div>
  if (!templates) return <div>Loading…</div>

  return (
    <div>
      <p style={{ color: '#666' }}>Active prompt templates. Editing a template creates a new version — existing jobs keep their frozen snapshot.</p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #ddd' }}>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Name</th>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Entity</th>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Field</th>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Lang</th>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Trust</th>
            <th style={{ textAlign: 'right', padding: '0.5rem' }}>Version</th>
          </tr>
        </thead>
        <tbody>
          {templates.map(t => (
            <tr key={t.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
              <td style={{ padding: '0.5rem' }}>{t.name}</td>
              <td style={{ padding: '0.5rem' }}>{t.entityType}</td>
              <td style={{ padding: '0.5rem' }}>{t.fieldType}</td>
              <td style={{ padding: '0.5rem' }}>{t.languageCode}</td>
              <td style={{ padding: '0.5rem' }}>{t.trustLevel}</td>
              <td style={{ padding: '0.5rem', textAlign: 'right' }}>v{t.version}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function JobsTab() {
  const [items, setItems] = useState<SeoBackfillJobListItem[] | null>(null)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('')

  const load = () => {
    adminApi.getSeoJobs({ status: statusFilter || undefined, limit: 50 })
      .then(r => { setItems(r.items); setTotal(r.total) })
      .catch(e => setError(String(e)))
  }

  useEffect(load, [statusFilter])

  const doAction = async (id: string, action: 'approve' | 'revert' | 'retry') => {
    try {
      if (action === 'approve') await adminApi.approveSeoJob(id)
      else if (action === 'revert') await adminApi.revertSeoJob(id)
      else await adminApi.retrySeoJob(id)
      load()
    } catch (e) { alert(String(e)) }
  }

  if (error) return <div style={{ color: 'red' }}>{error}</div>

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <label>
          Filter by status:{' '}
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            <option value="Queued">Queued</option>
            <option value="Running">Running</option>
            <option value="NeedsReview">Needs Review</option>
            <option value="Success">Success</option>
            <option value="Failed">Failed</option>
            <option value="Reverted">Reverted</option>
          </select>
        </label>
        <span style={{ marginLeft: '1rem', color: '#666' }}>Total: {total}</span>
      </div>

      {!items ? <div>Loading…</div> : items.length === 0 ? <div style={{ color: '#666' }}>No jobs match.</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #ddd' }}>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Status</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Entity</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Fields</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Triggered</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Created</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map(j => (
              <tr key={j.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '0.5rem' }}><StatusBadge status={j.status} /></td>
                <td style={{ padding: '0.5rem' }}>{j.entityType}</td>
                <td style={{ padding: '0.5rem' }}>{j.targetFields.join(', ')}</td>
                <td style={{ padding: '0.5rem', fontSize: 12, color: '#666' }}>{j.triggeredBy}</td>
                <td style={{ padding: '0.5rem', fontSize: 12 }}>{new Date(j.createdAt).toLocaleString()}</td>
                <td style={{ padding: '0.5rem' }}>
                  {j.status === 'NeedsReview' && <button onClick={() => doAction(j.id, 'approve')} style={{ marginRight: 4 }}>Approve</button>}
                  {(j.status === 'Success' || j.status === 'NeedsReview') && <button onClick={() => doAction(j.id, 'revert')} style={{ marginRight: 4 }}>Revert</button>}
                  {(j.status === 'Failed' || j.status === 'Reverted') && <button onClick={() => doAction(j.id, 'retry')}>Retry</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const color = status === 'Success' ? '#3a3'
    : status === 'Failed' ? '#c33'
    : status === 'NeedsReview' ? '#ea0'
    : status === 'Running' ? '#55d'
    : status === 'Reverted' ? '#888'
    : '#666'
  return (
    <span style={{ background: color, color: 'white', padding: '2px 8px', borderRadius: 3, fontSize: 12 }}>
      {status}
    </span>
  )
}

function SettingsTab() {
  const [settings, setSettings] = useState<SeoBackfillSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    adminApi.getSeoSettings().then(setSettings).catch(e => setError(String(e)))
  }, [])

  const save = async () => {
    if (!settings) return
    setSaving(true)
    try {
      await adminApi.updateSeoSettings(settings)
    } catch (e) { setError(String(e)) }
    setSaving(false)
  }

  if (error) return <div style={{ color: 'red' }}>{error}</div>
  if (!settings) return <div>Loading…</div>

  return (
    <div style={{ maxWidth: 500 }}>
      <label style={{ display: 'block', marginBottom: '1rem' }}>
        <input type="checkbox" checked={settings.enabled} onChange={e => setSettings({ ...settings, enabled: e.target.checked })} />
        {' '}Enable backfill poller
      </label>
      <label style={{ display: 'block', marginBottom: '1rem' }}>
        Jobs per run:{' '}
        <input type="number" min={1} max={50} value={settings.jobsPerRun}
          onChange={e => setSettings({ ...settings, jobsPerRun: Number(e.target.value) })} />
      </label>
      <label style={{ display: 'block', marginBottom: '1rem' }}>
        Interval (seconds):{' '}
        <input type="number" min={10} max={3600} value={settings.intervalSeconds}
          onChange={e => setSettings({ ...settings, intervalSeconds: Number(e.target.value) })} />
      </label>
      <label style={{ display: 'block', marginBottom: '1rem' }}>
        SSG rebuild batch (minutes):{' '}
        <input type="number" min={1} max={60} value={settings.ssgRebuildBatchMinutes}
          onChange={e => setSettings({ ...settings, ssgRebuildBatchMinutes: Number(e.target.value) })} />
      </label>
      <button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
    </div>
  )
}
