'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { isVideoJobInFlight, type VideoJobState } from '@/lib/media/video-job-notification'

// The live progress of one video optimise, as shown on its notification (both in
// the bell and on the notifications page).
//
// An encode takes a few minutes and the admin is expressly invited to walk away,
// so the notification is the only place the progress lives once the dialog is
// closed. The job's notification only moves on its own via the worker's final
// callback, so this pokes video-status, which proxies the worker's live figure
// and rewrites the notification. Otherwise the bar would sit frozen at whatever
// the last open dialog happened to see.

const POLL_MS = 5000

type Props = {
  /** The job ref the notification is keyed on (`<machineId>:<jobId>` in per-machine mode). */
  jobId: string
  state: VideoJobState
  /** 0-100, or null when nothing has been reported yet. */
  progress: number | null
  detail: string | null
  /** Called once the job reaches done/error, so the parent can pick up the new link. */
  onSettled?: () => void
}

// The stored detail leads with the percentage the bar already shows ("42%", or
// "42% - something went wrong"), so only the part after it is worth printing.
function noteFrom(detail: string | null): string | null {
  if (!detail) return null
  const rest = detail.replace(/^\d+%\s*(?:-\s*)?/, '').trim()
  return rest || null
}

export default function VideoJobProgress({ jobId, state, progress, detail, onSettled }: Props) {
  const router = useRouter()

  // What our own polling has learnt since the server last rendered this. Once we
  // are polling, ours is the fresher figure - the server's only moves because our
  // poll persists it - so a live value stands until the job's state itself changes
  // underneath us (the worker's callback landing, say), which clears it.
  type Live = { state: VideoJobState; progress: number | null; detail: string | null }
  const [live, setLive] = useState<Live | null>(null)
  const [seenState, setSeenState] = useState(state)
  if (seenState !== state) {
    setSeenState(state)
    setLive(null)
  }

  const shown: Live = live ?? { state, progress, detail }
  const inFlight = isVideoJobInFlight(shown.state)

  const onSettledRef = useRef(onSettled)
  useEffect(() => { onSettledRef.current = onSettled }, [onSettled])
  // The moment the job lands the notification grows a button, so whatever rendered
  // this needs re-reading - but only once, or a refresh loop is one render away.
  const settledRef = useRef(false)

  const settle = useCallback(() => {
    if (settledRef.current) return
    settledRef.current = true
    onSettledRef.current?.()
    router.refresh()
  }, [router])

  useEffect(() => {
    if (!inFlight) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const schedule = () => { timer = setTimeout(poll, POLL_MS) }

    async function poll() {
      try {
        const res = await fetch(`/api/admin/media/video-status?jobId=${encodeURIComponent(jobId)}`, { cache: 'no-store' })
        if (cancelled) return
        if (res.ok) {
          const d = await res.json()
          if (cancelled) return
          const status = typeof d.status === 'string' ? (d.status as VideoJobState) : null
          if (status) {
            const pct = typeof d.progress === 'number' && Number.isFinite(d.progress)
              ? Math.max(0, Math.min(100, Math.round(d.progress * 100)))
              : null
            setLive({ state: status, progress: pct, detail: typeof d.error === 'string' ? d.error : null })
            // Settled: stop polling and let the parent re-read the notification,
            // which by now carries the button through to the finished frames.
            if (!isVideoJobInFlight(status)) { settle(); return }
          }
        }
      } catch {
        // A blip on a job of this length is not worth reporting - the last known
        // figure stays on screen and the next tick tries again.
      }
      if (!cancelled) schedule()
    }

    poll()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [inFlight, jobId, settle])

  const pct = shown.progress ?? 0
  const failed = shown.state === 'error'
  const label = failed
    ? 'Optimise failed'
    : shown.state === 'done'
      ? 'Finished'
      : shown.state === 'queued'
        ? 'Waiting to start…'
        : 'Re-encoding the video…'
  const note = noteFrom(shown.detail)

  return (
    <div className="admin-seq-progress" role="status" aria-live="polite">
      <div className="admin-seq-progress-line">
        <span>{label}</span>
        {!failed && <span className="admin-seq-progress-pct">{pct}%</span>}
      </div>
      <div
        className="admin-seq-progress-track"
        role="progressbar"
        aria-label="Conversion progress"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={['admin-seq-progress-fill', failed ? 'admin-seq-progress-fill--error' : ''].filter(Boolean).join(' ')}
          style={{ width: `${failed ? 100 : pct}%` }}
        />
      </div>
      {note && (
        <p className={['admin-seq-progress-note', failed ? 'admin-seq-progress-note--error' : ''].filter(Boolean).join(' ')}>
          {note}
        </p>
      )}
    </div>
  )
}
