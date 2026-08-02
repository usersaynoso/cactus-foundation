'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'

// Media > Video. Two things live here: the Fly.io machine key (each video gets
// its own short-lived machine, destroyed the moment its job finishes) and a live
// list of every optimise job with its status. The job list is the job
// notifications read back, so clearing one clears its notification (and the
// bell) too.
//
// There are deliberately no encode settings here. How careful an optimise should
// be depends on the clip in front of you rather than on the site, so quality and
// largest-size are chosen per video in the Optimise video window.

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
  running: { cls: 'badge-blue', label: 'Encoding' },
  done: { cls: 'badge-green', label: 'Done' },
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

function describeFlySource(meta: FlyMeta): string {
  if (meta.source === 'saved') return 'Using the key saved here.'
  if (meta.source === 'env') return 'Using the key set in the environment - save one here to override it.'
  return 'No key yet. Without one, videos queue on the single service machine one at a time.'
}

export default function VideoSettingsPanel({
  initialFly,
  initialJobs,
  canManage,
}: {
  initialFly: FlyMeta
  initialJobs: Job[]
  /** config.manage - whether the settings can be edited here (vs read-only). */
  canManage: boolean
}) {
  const [fly, setFly] = useState<FlyMeta>(initialFly)
  // The token input is write-only: it never shows a stored value, only takes a
  // new one ('' = no change on save; the tick box removes a saved key).
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
  // A job's notification only moves on its own via the optimise window (while
  // open) or the worker's final done/error callback. So for any job still in
  // flight we first poke video-status, which proxies the worker's live progress
  // and rewrites the notification - otherwise a job whose window was closed sits
  // frozen at its last-seen % and refreshing would show nothing new. Then we read
  // the list back. Every fetch is best-effort: a failure leaves the last good
  // list on screen.
  const loadJobs = useCallback(async (): Promise<boolean> => {
    const active = jobsRef.current.filter((j) => j.state === 'queued' || j.state === 'running')
    if (active.length > 0) {
      await Promise.all(active.map((j) =>
        fetch(`/api/admin/media/video-status?jobId=${encodeURIComponent(j.jobId)}`, { cache: 'no-store' }).catch(() => {})
      ))
    }
    try {
      const res = await fetch('/api/admin/media/video-jobs', { cache: 'no-store' })
      if (!res.ok) return false
      const d = await res.json()
      if (Array.isArray(d.jobs)) setJobs(d.jobs as Job[])
      return true
    } catch {
      return false
    }
  }, [])

  // Poll the job list so statuses tick over while an optimise runs.
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

  async function save() {
    if (saving || !canManage) return
    setSaving(true)
    setError(null)
    setSaved(false)
    const payload: { fly?: { token?: string } } = {}
    const newToken = flyToken.trim()
    if (clearToken) payload.fly = { token: '' }
    else if (newToken) payload.fly = { token: newToken }
    try {
      const res = await fetch('/api/admin/media/video-worker-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof d.error === 'string' && d.error ? d.error : 'Could not save the settings.')
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

  // The job row IS its notification, so clearing it is the ordinary delete.
  // Optimistic: drop it now, put it back if the delete fails.
  async function deleteJob(id: string) {
    const prev = jobs
    setJobs((list) => list.filter((j) => j.id !== id))
    try {
      const res = await fetch(`/api/admin/notifications/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('delete failed')
    } catch {
      setJobs(prev)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', marginTop: 'var(--space-4)' }}>
      <section>
        <h2 style={{ margin: '0 0 var(--space-1) 0', fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-text)' }}>
          Video service
        </h2>
        <p style={{ margin: '0 0 var(--space-4) 0', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
          Where the heavy lifting happens when you optimise a video. Quality and size are chosen per video, in the Optimise video window.
        </p>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-text)' }}>Fly.io machines</h3>
            <p style={{ margin: 'var(--space-1) 0 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              With a Fly.io key, each video gets its own machine - a whole selection optimises at once, and every machine is removed the moment its job finishes so nothing sits around costing money.
            </p>
          </div>

          <div style={fieldWrap}>
            <label htmlFor="video-fly-token" style={sectionLabel}>Fly.io API key</label>
            <input
              id="video-fly-token"
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

        {canManage ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
            <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={save}>
              {saving ? 'Saving…' : 'Save settings'}
            </button>
            {saved && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-success)' }}>Saved.</span>}
            {error && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-error)' }} role="alert">{error}</span>}
          </div>
        ) : (
          <p style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
            You can see the settings but not change them. That needs the settings permission.
          </p>
        )}
      </section>

      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', margin: '0 0 var(--space-1) 0' }}>
          <h2 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-text)' }}>Recent jobs</h2>
          <button type="button" className="btn btn-secondary btn-sm" disabled={refreshing} onClick={refreshJobs}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <p style={{ margin: '0 0 var(--space-4) 0', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
          Every optimise and where it got to. A job stays here until you clear it - the same notice you see on the bell.
        </p>

        {jobs.length === 0 ? (
          <div className="card" style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: 'var(--space-6)' }}>
            Nothing optimised yet. Open a video in the library and press Optimise video.
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
                    {job.state === 'done' && job.detail && (
                      <p style={{ margin: 'var(--space-1) 0 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{job.detail.replace(/^100%\s*-\s*/, '')}</p>
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
