'use client'

import { type CSSProperties, useEffect, useRef, useState } from 'react'
import type { LibraryItem } from './types'
import { useFocusTrap } from './useFocusTrap'
import { filenameOf } from './format'

// "Convert to scroll sequence" — turn one video into a folder of alpha-WebP
// frames plus a manifest the scroll-sequence block can play. The heavy lifting
// is a worker's job and takes the better part of twenty minutes, so this dialog
// does two things: gather where the frames go and how they're built, then hand
// over to a progress view the admin is free to walk away from. The finished
// library tile is recorded server-side by a worker callback - there is nothing
// to finalise here, so on "done" the parent just refreshes and the tile appears.

const POLL_MS = 4000

type PresetKey = 'fast' | 'quality'
type JobStatus = 'queued' | 'running' | 'done' | 'error'

// Labels mirror lib/media/sequence-presets.ts. Kept inline rather than imported
// because that module pulls in Prisma and this is a client component.
const PRESET_LABELS: Record<PresetKey, string> = {
  fast: 'Fast',
  quality: 'High quality, slower',
}

// The numeric knobs behind each preset, shown as a one-line summary so the admin
// knows what they're choosing. Values are read from the settings, not chosen here
// - the server ignores anything the browser might send for engine/fps/width.
type PresetSummary = { engine: 'isnet' | 'birefnet'; fps: number; maxWidth: number }
type PresetSummaries = Record<PresetKey, PresetSummary>

function describePreset(p: PresetSummary): string {
  const removal = p.engine === 'birefnet' ? 'best-quality background removal' : 'fast background removal'
  return `${p.fps} fps · up to ${p.maxWidth}px wide · ${removal}`
}

export default function MediaSequenceDialog({
  item,
  folderId,
  onClose,
  onDone,
}: {
  /** The video being converted. */
  item: LibraryItem
  /** The folder the finished sequence tile should file into. */
  folderId: string | null
  onClose: () => void
  onDone: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef)

  // The video's name without its extension makes a sensible default.
  const defaultName = filenameOf(item).replace(/\.[^./\\]+$/, '')

  const [path, setPath] = useState('shop/')
  const [name, setName] = useState(defaultName)
  const [preset, setPreset] = useState<PresetKey>('fast')
  const [presets, setPresets] = useState<PresetSummaries | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Once a job exists the dialog flips from the form to the progress view.
  const [phase, setPhase] = useState<'form' | 'working'>('form')
  const [jobId, setJobId] = useState<string | null>(null)
  const [status, setStatus] = useState<JobStatus>('queued')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // The parent's onDone is an inline arrow, so it changes identity every render.
  // Held in a ref so the polling effect can call the latest one without listing
  // it as a dependency and restarting the poll on every render.
  const onDoneRef = useRef(onDone)
  useEffect(() => { onDoneRef.current = onDone }, [onDone])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !submitting) onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose, submitting])

  // Pull the admin-tuned preset knobs so the dialog can show what each choice
  // does. Purely for display - failing quietly just drops the summary line, the
  // conversion still runs the stored preset.
  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/media/sequence-presets')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d?.presets) setPresets(d.presets as PresetSummaries) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Poll the job's status every few seconds while the progress view is up. A blip
  // on a twenty-minute job shouldn't tear the view down, so a failed poll is only
  // fatal after several in a row; a definite 'error' status from the server is
  // fatal at once. 'done' hands back to the parent, which refreshes and closes.
  useEffect(() => {
    if (phase !== 'working' || !jobId) return
    const activeJobId = jobId
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let fails = 0

    const schedule = () => { timer = setTimeout(poll, POLL_MS) }

    async function poll() {
      try {
        const res = await fetch(`/api/admin/media/sequence-status?jobId=${encodeURIComponent(activeJobId)}`)
        const d = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) throw new Error(typeof d.error === 'string' && d.error ? d.error : `Status check failed (HTTP ${res.status})`)
        fails = 0
        setStatus(d.status as JobStatus)
        setProgress(clamp01(d.progress))
        if (d.status === 'done') { onDoneRef.current(); return }
        if (d.status === 'error') { setError(typeof d.error === 'string' && d.error ? d.error : 'The conversion ran into a problem and couldn’t finish.'); return }
        schedule()
      } catch (err) {
        if (cancelled) return
        // A blip during a 15-20 minute job shouldn't kill the view; only give up
        // after several failures in a row.
        fails += 1
        if (fails >= 4) { setError(err instanceof Error ? err.message : 'Lost contact with the conversion. It may still be running - reopen the library in a while to check.'); return }
        schedule()
      }
    }

    poll()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [phase, jobId])

  async function submit() {
    const cleanPath = path.trim()
    const cleanName = name.trim()
    if (!cleanPath || !cleanName || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/media/${item.id}/convert-sequence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: cleanPath, name: cleanName, folderId, preset }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof d.error === 'string' && d.error ? d.error : 'Could not start the conversion.')
      if (!d.jobId) throw new Error('The conversion started but returned nothing to track.')
      setJobId(d.jobId as string)
      setStatus('queued')
      setProgress(0)
      setPhase('working')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the conversion.')
    } finally {
      setSubmitting(false)
    }
  }

  // Back to the form after a failure, inputs kept, so a retry is one edit away.
  function retry() {
    setError(null)
    setJobId(null)
    setStatus('queued')
    setProgress(0)
    setPhase('form')
  }

  const pct = Math.round(progress * 100)
  const canSubmit = !!path.trim() && !!name.trim() && !submitting

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Convert to scroll sequence"
      onClick={() => { if (!submitting) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'var(--color-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-xl)', maxWidth: 'min(560px, 94vw)', width: '100%', maxHeight: '92vh', overflow: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <h2 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-text)' }}>
            Convert to scroll sequence
          </h2>
          <button type="button" onClick={() => { if (!submitting) onClose() }} aria-label="Close" style={closeBtn}>×</button>
        </div>

        {phase === 'form' ? (
          <>
            <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
              This turns “{filenameOf(item)}” into a scroll-through sequence of frames with the background removed. It runs in the background and takes around 15-20 minutes.
            </p>

            {/* Destination path */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label htmlFor="seq-path" style={sectionLabel}>Destination path</label>
              <input
                id="seq-path"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="shop/office-chairs/ergonomic/chiro-plus"
                style={textInput}
              />
              <span style={helpText}>Where the frames are stored, e.g. shop/office-chairs/ergonomic/chiro-plus</span>
            </div>

            {/* Sequence name */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label htmlFor="seq-name" style={sectionLabel}>Sequence name</label>
              <input
                id="seq-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={defaultName}
                style={textInput}
              />
            </div>

            {/* Quality preset */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label htmlFor="seq-preset" style={sectionLabel}>Quality preset</label>
              <select id="seq-preset" value={preset} onChange={(e) => setPreset(e.target.value as PresetKey)} style={textInput}>
                <option value="fast">{PRESET_LABELS.fast}</option>
                <option value="quality">{PRESET_LABELS.quality}</option>
              </select>
              <span style={helpText}>
                {presets ? describePreset(presets[preset]) : 'Set the frame rate and quality of each preset under Media › Scroll sequences.'}
              </span>
            </div>

            {error && <div style={errorBox} role="alert">{error}</div>}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary btn-sm" disabled={submitting} onClick={onClose}>Cancel</button>
              <button type="button" className="btn btn-primary btn-sm" disabled={!canSubmit} onClick={submit}>
                {submitting ? 'Starting…' : 'Create scroll sequence'}
              </button>
            </div>
          </>
        ) : error ? (
          <>
            <div style={errorBox} role="alert">{error}</div>
            <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
              You can try again, or close this and check back later - if it did finish, the sequence will be waiting in your library.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={retry}>Try again</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.5rem' }}>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}>
                  {status === 'queued' ? 'Waiting to start…' : 'Building the sequence…'}
                </span>
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text)' }}>{pct}%</span>
              </div>
              <div
                role="progressbar"
                aria-label="Conversion progress"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                style={{ height: '0.6rem', width: '100%', background: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}
              >
                <div style={{ height: '100%', width: `${pct}%`, background: 'var(--color-primary)', borderRadius: 'var(--radius-full)', transition: 'width var(--dur-fast)' }} />
              </div>
            </div>

            <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
              This takes around 15-20 minutes. You can close this window and carry on - the finished sequence turns up in your library on its own when it’s ready.
            </p>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function clamp01(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0
  return v < 0 ? 0 : v > 1 ? 1 : v
}

const sectionLabel: CSSProperties = { fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--color-text-muted)' }
const textInput: CSSProperties = { padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', width: '100%', fontFamily: 'inherit', fontSize: 'var(--text-sm)', background: 'var(--color-surface)', color: 'var(--color-text)' }
const helpText: CSSProperties = { fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }
const errorBox: CSSProperties = { fontSize: 'var(--text-sm)', color: 'var(--color-error)', background: 'var(--color-error-bg)', border: '1px solid var(--color-destructive-border)', borderRadius: 'var(--radius)', padding: 'var(--space-2) var(--space-3)' }
const closeBtn: CSSProperties = { marginLeft: 'auto', width: '2rem', height: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-subtle)', color: 'var(--color-text)', cursor: 'pointer', fontSize: '1.25rem', lineHeight: 1, fontFamily: 'inherit' }
