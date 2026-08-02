'use client'

import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react'
import type { LibraryItem } from './types'
import { useFocusTrap } from './useFocusTrap'
import { filenameOf, formatBytes } from './format'
import {
  DEFAULT_VIDEO_MAX_WIDTH,
  DEFAULT_VIDEO_QUALITY,
  VIDEO_QUALITY_LEVELS,
  VIDEO_WIDTH_CHOICES,
  type VideoQualityLevel,
} from '@/lib/media/video-quality'

// "Optimise video" - re-encode one video, or a whole selection of them, into the
// single format every device plays (MP4 / H.264 / AAC), as small as they can be
// made without the difference showing. The work happens on the media worker and
// takes a couple of minutes a clip, so this gathers the two choices worth making
// and then hands over to a progress view the admin is free to walk away from:
// each library row is updated by that job's callback, not by this tab.
//
// Every video gets a Fly machine of its own, so a selection of twenty encodes in
// the time one does rather than twenty times as long. There is no cap here on
// purpose - a machine exists only while its own job runs, so ten at once costs
// what ten in a row would (the optional SEQUENCE_MAX_JOB_MACHINES lid still
// applies server-side for anyone who wants one).
//
// The optimised file replaces the original in place - same item, same link - so
// anything already pointing at the video keeps working.

const POLL_MS = 3000

// How many jobs are STARTED at once. Not a limit on how many run: starting a job
// waits for a fresh machine to boot (twenty-odd seconds), so a hundred at once
// would be a hundred simultaneous Fly creates and one very long-faced browser.
// Four at a time keeps that steady while the jobs themselves all run in parallel.
const START_CONCURRENCY = 4

type JobState = 'pending' | 'queued' | 'running' | 'done' | 'error'

type Job = {
  mediaId: string
  name: string
  sizeBytes: number
  jobRef: string | null
  state: JobState
  progress: number
  error: string | null
}

function isSettled(state: JobState): boolean {
  return state === 'done' || state === 'error'
}

export default function MediaVideoOptimiseDialog({
  items,
  onClose,
  onDone,
}: {
  /** The videos being optimised - one from the detail panel, many from the selection bar. */
  items: LibraryItem[]
  onClose: () => void
  /** Called once every job has settled, so the parent can refresh the library. */
  onDone: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef)

  const [quality, setQuality] = useState<VideoQualityLevel>(DEFAULT_VIDEO_QUALITY)
  const [maxWidth, setMaxWidth] = useState<number>(DEFAULT_VIDEO_MAX_WIDTH)
  const [submitting, setSubmitting] = useState(false)

  const [phase, setPhase] = useState<'form' | 'working'>('form')
  const [jobs, setJobs] = useState<Job[]>([])
  const [startError, setStartError] = useState<string | null>(null)

  const many = items.length > 1
  const totalBytes = items.reduce((sum, i) => sum + i.sizeBytes, 0)

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

  const patch = useCallback((mediaId: string, next: Partial<Job>) => {
    setJobs((prev) => prev.map((j) => (j.mediaId === mediaId ? { ...j, ...next } : j)))
  }, [])

  // --- starting ------------------------------------------------------------

  async function startOne(item: LibraryItem): Promise<void> {
    try {
      const res = await fetch(`/api/admin/media/${item.id}/optimise-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quality, maxWidth }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof d.error === 'string' && d.error ? d.error : 'Could not start the optimise.')
      if (!d.jobId) throw new Error('The optimise started but returned nothing to track.')
      patch(item.id, { jobRef: d.jobId as string, state: 'queued' })
    } catch (err) {
      // One video failing to start never stops the rest - the selection is
      // usually a folder's worth, and losing nineteen because the twentieth is
      // on the wrong storage provider would be its own bug report.
      patch(item.id, { state: 'error', error: err instanceof Error ? err.message : 'Could not start the optimise.' })
    }
  }

  async function submit() {
    if (submitting) return
    setSubmitting(true)
    setStartError(null)
    setJobs(items.map((i) => ({
      mediaId: i.id,
      name: filenameOf(i),
      sizeBytes: i.sizeBytes,
      jobRef: null,
      state: 'pending',
      progress: 0,
      error: null,
    })))
    setPhase('working')

    try {
      const queue = [...items]
      const runners = Array.from({ length: Math.min(START_CONCURRENCY, queue.length) }, async () => {
        for (;;) {
          const next = queue.shift()
          if (!next) return
          await startOne(next)
        }
      })
      await Promise.all(runners)
    } finally {
      setSubmitting(false)
    }
  }

  // --- polling -------------------------------------------------------------

  // Live mirrors for the polling loop, which must not re-subscribe on each tick.
  const jobsRef = useRef(jobs)
  useEffect(() => { jobsRef.current = jobs }, [jobs])
  const startingRef = useRef(submitting)
  useEffect(() => { startingRef.current = submitting }, [submitting])


  // One timer for the whole dialog, asking after every job that hasn't settled.
  // A poll that fails is not fatal on its own: the encode carries on regardless,
  // and the next tick usually finds it - only a run of failures gives up.
  useEffect(() => {
    if (phase !== 'working') return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let fails = 0

    async function tick() {
      const live = jobsRef.current.filter((j) => j.jobRef && !isSettled(j.state))
      if (live.length === 0) {
        // Still handing jobs out - the ones already running have simply finished
        // first. Keep ticking until the starting pass is done.
        if (startingRef.current) {
          if (!cancelled) timer = setTimeout(tick, POLL_MS)
          return
        }
        // Everything settled. A clean run hands straight back to the parent,
        // which closes this and refreshes the library. A run with failures does
        // NOT: the rows naming what went wrong are the only place that is said,
        // and closing over them would leave the admin with a toast and a shrug.
        if (!jobsRef.current.some((j) => j.state === 'error')) onDoneRef.current()
        return
      }
      let anyOk = false
      await Promise.all(live.map(async (job) => {
        try {
          const res = await fetch(`/api/admin/media/video-status?jobId=${encodeURIComponent(job.jobRef!)}`, { cache: 'no-store' })
          const d = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(typeof d.error === 'string' && d.error ? d.error : `Status check failed (HTTP ${res.status})`)
          anyOk = true
          if (cancelled) return
          const state = (typeof d.status === 'string' ? d.status : 'running') as JobState
          patch(job.mediaId, {
            state,
            progress: clamp01(d.progress),
            error: state === 'error'
              ? (typeof d.error === 'string' && d.error ? d.error : 'The optimise ran into a problem and couldn’t finish.')
              : null,
          })
        } catch {
          // Left to the run-of-failures check below.
        }
      }))
      if (cancelled) return
      fails = anyOk ? 0 : fails + 1
      if (fails >= 4) {
        setStartError('Lost contact with the optimiser. The videos may still be encoding - reopen the library in a while to check.')
        return
      }
      timer = setTimeout(tick, POLL_MS)
    }

    tick()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
    // Deliberately keyed on the phase alone: the loop reads the live jobs off a
    // ref, so a progress tick doesn't tear the timer down and start it again.
  }, [phase, patch])

  // Back to the form after a failure, choices kept, so a retry is one click away.
  function retry() {
    setStartError(null)
    setJobs([])
    setPhase('form')
  }

  const settledCount = jobs.filter((j) => isSettled(j.state)).length
  const failedCount = jobs.filter((j) => j.state === 'error').length
  const allSettled = jobs.length > 0 && settledCount === jobs.length
  const overallPct = jobs.length === 0
    ? 0
    : Math.round((jobs.reduce((sum, j) => sum + (isSettled(j.state) ? 1 : j.progress), 0) / jobs.length) * 100)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={many ? `Optimise ${items.length} videos` : 'Optimise video'}
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
            {many ? `Optimise ${items.length} videos` : 'Optimise video'}
          </h2>
          <button type="button" onClick={() => { if (!submitting) onClose() }} aria-label="Close" style={closeBtn}>×</button>
        </div>

        {phase === 'form' ? (
          <>
            <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
              {many
                ? `These ${items.length} videos come to ${formatBytes(totalBytes)} between them.`
                : `“${filenameOf(items[0]!)}” is ${formatBytes(totalBytes)}.`}
              {' '}This re-encodes {many ? 'them' : 'it'} into the one video format every phone, tablet, computer and TV can play, at a fraction of the weight. The optimised {many ? 'files take their originals’' : 'file takes the original’s'} place, so anything already using {many ? 'them' : 'it'} carries on working.
              {many ? ' Each video gets a machine of its own, so they all encode at the same time rather than one after another.' : ''}
            </p>

            {/* Quality */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <span style={sectionLabel}>Quality</span>
              {VIDEO_QUALITY_LEVELS.map((level) => (
                <label key={level.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}>
                  <input
                    type="radio"
                    name="video-quality"
                    value={level.id}
                    checked={quality === level.id}
                    onChange={() => setQuality(level.id)}
                    style={{ marginTop: '0.2rem' }}
                  />
                  <span>
                    {level.label}
                    <span style={{ display: 'block', ...helpText }}>{level.hint}</span>
                  </span>
                </label>
              ))}
            </div>

            {/* Size cap */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label htmlFor="video-width" style={sectionLabel}>Largest size</label>
              <select
                id="video-width"
                value={maxWidth}
                onChange={(e) => setMaxWidth(Number(e.target.value))}
                style={textInput}
              >
                {VIDEO_WIDTH_CHOICES.map((w) => (
                  <option key={w} value={w}>{w === 1920 ? '1920 across (full HD)' : `${w} across`}</option>
                ))}
              </select>
              <span style={helpText}>
                Videos smaller than this are left at the size they are - nothing is ever stretched up. Drop it below full HD only for clips that never fill the screen.
              </span>
            </div>

            {many && (
              <ul style={{ margin: 0, paddingLeft: '1.1rem', maxHeight: '9rem', overflowY: 'auto', ...helpText }}>
                {items.map((i) => <li key={i.id}>{filenameOf(i)} · {formatBytes(i.sizeBytes)}</li>)}
              </ul>
            )}

            {startError && <div style={errorBox} role="alert">{startError}</div>}

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary btn-sm" disabled={submitting} onClick={onClose}>Cancel</button>
              <button type="button" className="btn btn-primary btn-sm" disabled={submitting} onClick={submit}>
                {submitting ? 'Starting…' : many ? `Optimise ${items.length} videos` : 'Optimise video'}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Overall bar - the only one when there is a single video. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.5rem' }}>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}>
                  {allSettled
                    ? failedCount === 0
                      ? many ? 'All done' : 'Done'
                      : `Finished with ${failedCount} problem${failedCount === 1 ? '' : 's'}`
                    : submitting
                      ? 'Starting them off…'
                      : many
                        ? `Re-encoding ${jobs.length} videos… (${settledCount} of ${jobs.length} done)`
                        : 'Re-encoding the video…'}
                </span>
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text)' }}>{overallPct}%</span>
              </div>
              <div
                role="progressbar"
                aria-label="Optimise progress"
                aria-valuenow={overallPct}
                aria-valuemin={0}
                aria-valuemax={100}
                style={{ height: '0.6rem', width: '100%', background: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}
              >
                <div style={{ height: '100%', width: `${overallPct}%`, background: 'var(--color-primary)', borderRadius: 'var(--radius-full)', transition: 'width var(--dur-fast)' }} />
              </div>
            </div>

            {/* Per-video rows, so a failure names itself rather than hiding in an average. */}
            {many && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '16rem', overflowY: 'auto' }}>
                {jobs.map((job) => (
                  <div key={job.mediaId} style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', fontSize: 'var(--text-xs)' }}>
                      <span style={{ color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.name}</span>
                      <span style={{ color: job.state === 'error' ? 'var(--color-error)' : 'var(--color-text-muted)', flexShrink: 0 }}>
                        {job.state === 'error' ? 'Failed' : job.state === 'done' ? 'Done' : job.state === 'pending' ? 'Waiting' : `${Math.round(job.progress * 100)}%`}
                      </span>
                    </div>
                    <div style={{ height: '0.3rem', width: '100%', background: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${job.state === 'done' ? 100 : Math.round(job.progress * 100)}%`, background: job.state === 'error' ? 'var(--color-error)' : 'var(--color-primary)', borderRadius: 'var(--radius-full)', transition: 'width var(--dur-fast)' }} />
                    </div>
                    {job.error && <span style={{ ...helpText, color: 'var(--color-error)' }}>{job.error}</span>}
                  </div>
                ))}
              </div>
            )}

            {!many && jobs[0]?.error && <div style={errorBox} role="alert">{jobs[0].error}</div>}
            {startError && <div style={errorBox} role="alert">{startError}</div>}

            <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
              {allSettled
                ? failedCount === 0
                  ? 'Nothing else to do - the smaller version is already in its place.'
                  : 'The ones that failed are untouched: their original files are exactly as they were.'
                : 'A few minutes for a typical product clip. You can close this window and carry on - each video updates itself when it’s done, and the bell will say so.'}
            </p>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>Close</button>
              {allSettled && failedCount > 0 && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={retry}>Try again</button>
              )}
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
