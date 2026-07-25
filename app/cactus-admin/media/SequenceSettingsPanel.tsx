'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'

// Media > Scroll sequences. Two things live here: the conversion presets ("Fast"
// and "High quality, slower") an admin tunes once, and a live list of every
// scroll-sequence job with its status. The presets feed the convert dialog and
// the enqueue route; the job list is just the job notifications read back, so
// deleting one deletes its notification (and clears the bell).

type PresetKey = 'fast' | 'quality'
type Engine = 'isnet' | 'birefnet'
type Preset = { engine: Engine; fps: number; maxWidth: number }
type Presets = Record<PresetKey, Preset>

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

const PRESET_LABELS: Record<PresetKey, string> = {
  fast: 'Fast',
  quality: 'High quality, slower',
}

const PRESET_BLURB: Record<PresetKey, string> = {
  fast: 'The everyday choice - quicker to build, easily good enough for most product spins.',
  quality: 'Sharper edges on tricky subjects (hair, glass, fine detail) at the cost of a longer wait.',
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

export default function SequenceSettingsPanel({
  initialPresets,
  initialJobs,
  canManage,
}: {
  initialPresets: Presets
  initialJobs: Job[]
  /** config.manage - whether the presets can be edited here (vs read-only). */
  canManage: boolean
}) {
  const [presets, setPresets] = useState<Presets>(initialPresets)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [jobs, setJobs] = useState<Job[]>(initialJobs)
  const [refreshing, setRefreshing] = useState(false)

  // Fetch the job list once. Shared by the poller and the manual Refresh button. A
  // failed fetch is swallowed - the last good list stays on screen. Returns whether
  // it landed so the button can flag a wobble if it did not.
  const loadJobs = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/admin/media/sequence-jobs')
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

  function setPresetField(key: PresetKey, field: keyof Preset, value: Engine | number) {
    setSaved(false)
    setPresets((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }))
  }

  async function save() {
    if (saving || !canManage) return
    setSaving(true)
    setError(null)
    setSaved(false)
    // Clamp before sending so a stray number never trips the server validation.
    const payload: Presets = {
      fast: {
        engine: presets.fast.engine,
        fps: clampInt(presets.fast.fps, 1, 60),
        maxWidth: clampInt(presets.fast.maxWidth, 320, 3840),
      },
      quality: {
        engine: presets.quality.engine,
        fps: clampInt(presets.quality.fps, 1, 60),
        maxWidth: clampInt(presets.quality.maxWidth, 320, 3840),
      },
    }
    try {
      const res = await fetch('/api/admin/media/sequence-presets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof d.error === 'string' && d.error ? d.error : 'Could not save the presets.')
      if (d.presets) setPresets(d.presets as Presets)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the presets.')
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
      {/* ── Presets ─────────────────────────────────────────────────────── */}
      <section>
        <h2 style={{ margin: '0 0 var(--space-1) 0', fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-text)' }}>
          Conversion presets
        </h2>
        <p style={{ margin: '0 0 var(--space-4) 0', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
          These are the two choices offered when you turn a video into a scroll sequence. Tune what each one does here.
        </p>

        <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {(['fast', 'quality'] as PresetKey[]).map((key) => (
            <div key={key} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-text)' }}>{PRESET_LABELS[key]}</h3>
                <p style={{ margin: 'var(--space-1) 0 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{PRESET_BLURB[key]}</p>
              </div>

              <div style={fieldWrap}>
                <label htmlFor={`${key}-engine`} style={sectionLabel}>Background removal</label>
                <select
                  id={`${key}-engine`}
                  value={presets[key].engine}
                  disabled={!canManage}
                  onChange={(e) => setPresetField(key, 'engine', e.target.value as Engine)}
                  style={textInput}
                >
                  <option value="isnet">Fast removal</option>
                  <option value="birefnet">Best-quality removal</option>
                </select>
              </div>

              <div style={fieldWrap}>
                <label htmlFor={`${key}-fps`} style={sectionLabel}>Frames per second</label>
                <input
                  id={`${key}-fps`}
                  type="number"
                  min={1}
                  max={60}
                  value={presets[key].fps}
                  disabled={!canManage}
                  onChange={(e) => setPresetField(key, 'fps', Number(e.target.value))}
                  onBlur={(e) => setPresetField(key, 'fps', clampInt(Number(e.target.value), 1, 60))}
                  style={{ ...textInput, maxWidth: '8rem' }}
                />
                <span style={helpText}>Between 1 and 60. More frames make a smoother scroll but a larger sequence.</span>
              </div>

              <div style={fieldWrap}>
                <label htmlFor={`${key}-width`} style={sectionLabel}>Maximum width (px)</label>
                <input
                  id={`${key}-width`}
                  type="number"
                  min={320}
                  max={3840}
                  step={20}
                  value={presets[key].maxWidth}
                  disabled={!canManage}
                  onChange={(e) => setPresetField(key, 'maxWidth', Number(e.target.value))}
                  onBlur={(e) => setPresetField(key, 'maxWidth', clampInt(Number(e.target.value), 320, 3840))}
                  style={{ ...textInput, maxWidth: '8rem' }}
                />
                <span style={helpText}>Frames are scaled down to this width. Between 320 and 3840.</span>
              </div>
            </div>
          ))}
        </div>

        {canManage && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
            <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={save}>
              {saving ? 'Saving…' : 'Save presets'}
            </button>
            {saved && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-success)' }}>Saved.</span>}
            {error && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-error)' }} role="alert">{error}</span>}
          </div>
        )}
        {!canManage && (
          <p style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
            You can see the presets but not change them. That needs the settings permission.
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
