'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'

// Media > Scroll sequences. Three things live here: the conversion settings
// (one set of knobs - every conversion runs high quality), the Fly.io machine
// key (each conversion gets its own short-lived machine, destroyed when the job
// finishes), and a live list of every scroll-sequence job with its status. The
// job list is just the job notifications read back, so deleting one deletes its
// notification (and clears the bell).

type SequenceEngine = 'isnet' | 'birefnet'
type Settings = { engine: SequenceEngine; fps: number; maxWidth: number }
type FlyMeta = {
  /** Where the active token comes from: saved here, the environment, or nowhere. */
  source: 'saved' | 'env' | null
  configured: boolean
  appName: string | null
}

type JobState = 'queued' | 'running' | 'done' | 'error'
type Job = {
  id: string
  jobId: string
  name: string
  state: JobState
  progress: number | null
  detail: string | null
  updatedAt: string
  createdAt: string
}

const JOBS_POLL_MS = 8000

const STATE_BADGE: Record<JobState, { cls: string; label: string }> = {
  queued: { cls: 'badge-gray', label: 'Queued' },
  running: { cls: 'badge-blue', label: 'Building' },
  done: { cls: 'badge-green', label: 'Complete' },
  error: { cls: 'badge-red', label: 'Failed' },
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.round(value)))
}

function describeFlySource(meta: FlyMeta): string {
  if (meta.source === 'saved') return 'Using the key saved here.'
  if (meta.source === 'env') return 'Using the key set in the environment - save one here to override it.'
  return 'No key yet. Without one, conversions queue on the single worker machine one at a time.'
}

export default function SequenceSettingsPanel({
  initialSettings,
  initialFly,
  initialJobs,
  canManage,
}: {
  initialSettings: Settings
  initialFly: FlyMeta
  initialJobs: Job[]
  /** config.manage - whether the settings can be edited here (vs read-only). */
  canManage: boolean
}) {
  const [settings, setSettings] = useState<Settings>(initialSettings)
  const [fly, setFly] = useState<FlyMeta>(initialFly)
  // The token input is write-only: it never shows a stored value, only takes a
  // new one ('' = no change on save; the Clear button removes a saved key).
  const [flyToken, setFlyToken] = useState('')
  const [clearToken, setClearToken] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [jobs, setJobs] = useState<Job[]>(initialJobs)
  const [refreshing, setRefreshing] = useState(false)

  // Latest job list, kept in a ref so loadJobs can see it without re-subscribing.
  const jobsRef = useRef<Job[]>(initialJobs)
  useEffect(() => { jobsRef.current = jobs }, [jobs])

  // Refresh the job list. Shared by the poller and the manual Refresh button.
  //
  // A job's notification only moves on its own via the convert dialog (while open)
  // or the worker's final done/error callback. So for any job still in flight we
  // first poke sequence-status, which proxies the worker's live progress and
  // rewrites the notification - otherwise a job whose dialog was closed sits
  // frozen at its last-seen % and refreshing would show nothing new. Then we read
  // the list back. Every fetch is best-effort: a failure leaves the last good list
  // on screen. Returns whether the list read landed.
  const loadJobs = useCallback(async (): Promise<boolean> => {
    const active = jobsRef.current.filter((j) => j.state === 'queued' || j.state === 'running')
    if (active.length > 0) {
      await Promise.all(active.map((j) =>
        fetch(`/api/admin/media/sequence-status?jobId=${encodeURIComponent(j.jobId)}`, { cache: 'no-store' }).catch(() => {})
      ))
    }
    try {
      const res = await fetch('/api/admin/media/sequence-jobs', { cache: 'no-store' })
      if (!res.ok) return false
      const d = await res.json()
      if (Array.isArray(d.jobs)) setJobs(d.jobs as Job[])
      return true
    } catch {
      return false
    }
  }, [])

  // Poll the job list so statuses tick over while a conversion runs.
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const schedule = () => { timer = setTimeout(poll, JOBS_POLL_MS) }
    async function poll() {
      await loadJobs()
      if (!cancelled) schedule()
    }
    schedule()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [loadJobs])

  async function refreshJobs() {
    if (refreshing) return
    setRefreshing(true)
    try {
      await loadJobs()
    } finally {
      setRefreshing(false)
    }
  }

  function setSettingsField(field: 'fps' | 'maxWidth', value: number) {
    setSaved(false)
    setSettings((prev) => ({ ...prev, [field]: value }))
  }

  function setEngine(engine: SequenceEngine) {
    setSaved(false)
    setSettings((prev) => ({ ...prev, engine }))
  }

  async function save() {
    if (saving || !canManage) return
    setSaving(true)
    setError(null)
    setSaved(false)
    // Clamp before sending so a stray number never trips the server validation.
    const payload: {
      settings: Settings
      fly?: { token?: string }
    } = {
      settings: {
        engine: settings.engine,
        fps: clampInt(settings.fps, 1, 60),
        maxWidth: clampInt(settings.maxWidth, 320, 3840),
      },
    }
    const newToken = flyToken.trim()
    if (clearToken) payload.fly = { token: '' }
    else if (newToken) payload.fly = { token: newToken }
    try {
      const res = await fetch('/api/admin/media/sequence-presets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof d.error === 'string' && d.error ? d.error : 'Could not save the settings.')
      if (d.settings) setSettings(d.settings as Settings)
      if (d.fly) setFly(d.fly as FlyMeta)
      setFlyToken('')
      setClearToken(false)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the settings.')
    } finally {
      setSaving(false)
    }
  }

  const deletingRef = useRef<Set<string>>(new Set())
  async function deleteJob(id: string) {
    if (deletingRef.current.has(id)) return
    deletingRef.current.add(id)
    // Optimistic: drop it now, put it back if the delete fails.
    const prev = jobs
    setJobs((list) => list.filter((j) => j.id !== id))
    try {
      const res = await fetch(`/api/admin/notifications/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('delete failed')
    } catch {
      setJobs(prev)
    } finally {
      deletingRef.current.delete(id)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* ── Conversion settings ─────────────────────────────────────────── */}
      <section>
        <h2 style={{ margin: '0 0 var(--space-1) 0', fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-text)' }}>
          Conversion settings
        </h2>
        <p style={{ margin: '0 0 var(--space-4) 0', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
          Every conversion runs at these settings - high quality by default, with the background lifted out cleanly.
        </p>

        <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div style={fieldWrap}>
              <label htmlFor="seq-engine" style={sectionLabel}>Cut-out quality</label>
              <select
                id="seq-engine"
                value={settings.engine}
                disabled={!canManage}
                onChange={(e) => setEngine(e.target.value as SequenceEngine)}
                style={{ ...textInput, maxWidth: '16rem' }}
              >
                <option value="isnet">Standard - quick, fine for most products</option>
                <option value="birefnet">Detailed - slower, best for mesh and thin frames</option>
              </select>
              <span style={helpText}>Detailed takes noticeably longer per video but handles fine structure like mesh chair backs better.</span>
            </div>

            <div style={fieldWrap}>
              <label htmlFor="seq-fps" style={sectionLabel}>Frames per second</label>
              <input
                id="seq-fps"
                type="number"
                min={1}
                max={60}
                value={settings.fps}
                disabled={!canManage}
                onChange={(e) => setSettingsField('fps', Number(e.target.value))}
                onBlur={(e) => setSettingsField('fps', clampInt(Number(e.target.value), 1, 60))}
                style={{ ...textInput, maxWidth: '8rem' }}
              />
              <span style={helpText}>Between 1 and 60. More frames make a smoother scroll but a larger sequence.</span>
            </div>

            <div style={fieldWrap}>
              <label htmlFor="seq-width" style={sectionLabel}>Maximum width (px)</label>
              <input
                id="seq-width"
                type="number"
                min={320}
                max={3840}
                step={20}
                value={settings.maxWidth}
                disabled={!canManage}
                onChange={(e) => setSettingsField('maxWidth', Number(e.target.value))}
                onBlur={(e) => setSettingsField('maxWidth', clampInt(Number(e.target.value), 320, 3840))}
                style={{ ...textInput, maxWidth: '8rem' }}
              />
              <span style={helpText}>Frames are scaled down to this width. Between 320 and 3840.</span>
            </div>
          </div>

          {/* ── Fly.io machines ─────────────────────────────────────────── */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-text)' }}>Fly.io machines</h3>
              <p style={{ margin: 'var(--space-1) 0 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                With a Fly.io key, each video gets its own conversion machine - several convert at once, and every machine is removed the moment its job finishes so nothing sits around costing money.
              </p>
            </div>

            <div style={fieldWrap}>
              <label htmlFor="seq-fly-token" style={sectionLabel}>Fly.io API key</label>
              <input
                id="seq-fly-token"
                type="password"
                autoComplete="off"
                value={flyToken}
                disabled={!canManage || clearToken}
                placeholder={fly.source ? '••••••••  (a key is set)' : 'Paste a Fly.io API key'}
                onChange={(e) => { setFlyToken(e.target.value); setSaved(false) }}
                style={textInput}
              />
              <span style={helpText}>{describeFlySource(fly)}</span>
              {canManage && fly.source === 'saved' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                  <input
                    type="checkbox"
                    checked={clearToken}
                    onChange={(e) => { setClearToken(e.target.checked); setSaved(false) }}
                  />
                  Remove the saved key on save
                </label>
              )}
            </div>
          </div>
        </div>

        {canManage && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
            <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={save}>
              {saving ? 'Saving…' : 'Save settings'}
            </button>
            {saved && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-success)' }}>Saved.</span>}
            {error && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-error)' }} role="alert">{error}</span>}
          </div>
        )}
        {!canManage && (
          <p style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
            You can see the settings but not change them. That needs the settings permission.
          </p>
        )}
      </section>

      {/* ── Jobs ────────────────────────────────────────────────────────── */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', margin: '0 0 var(--space-1) 0' }}>
          <h2 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-text)' }}>
            Recent jobs
          </h2>
          <button type="button" className="btn btn-secondary btn-sm" disabled={refreshing} onClick={refreshJobs}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <p style={{ margin: '0 0 var(--space-4) 0', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
          Every conversion and where it got to. A job stays here until you clear it - the same notice you see on the bell.
        </p>

        {jobs.length === 0 ? (
          <div className="card" style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: 'var(--space-6)' }}>
            No scroll sequences yet. Convert a video from the library to get started.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {jobs.map((job) => {
              const badge = STATE_BADGE[job.state]
              const showBar = job.state === 'queued' || job.state === 'running'
              const pct = job.progress ?? 0
              return (
                <div key={job.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '12rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}>{job.name}</strong>
                      <span className={`badge ${badge.cls}`}>{badge.label}</span>
                      {job.progress !== null && job.state !== 'done' && (
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{pct}%</span>
                      )}
                    </div>
                    {showBar && (
                      <div style={{ marginTop: 'var(--space-2)', height: '0.4rem', width: '100%', maxWidth: '20rem', background: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--color-primary)', borderRadius: 'var(--radius-full)', transition: 'width var(--dur-fast)' }} />
                      </div>
                    )}
                    {job.state === 'error' && job.detail && (
                      <p style={{ margin: 'var(--space-1) 0 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-error)' }}>{job.detail}</p>
                    )}
                    <p style={{ margin: 'var(--space-1) 0 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                      Updated {relativeTime(job.updatedAt)}
                    </p>
                  </div>
                  {canManage && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => deleteJob(job.id)} aria-label={`Clear ${job.name}`}>
                      Clear
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

const fieldWrap: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.4rem' }
const sectionLabel: CSSProperties = { fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--color-text-muted)' }
const textInput: CSSProperties = { padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', width: '100%', fontFamily: 'inherit', fontSize: 'var(--text-sm)', background: 'var(--color-surface)', color: 'var(--color-text)' }
const helpText: CSSProperties = { fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }
