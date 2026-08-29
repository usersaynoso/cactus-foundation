'use client'

import { useCallback, useEffect, useState } from 'react'

// The "how often should this run" dropdown, in two shapes.
//
// `CronScheduleField` is the control itself, for a page that has already loaded the job
// list - Settings > Schedules renders one per job from a single fetch.
//
// `CronScheduleSetting` is the same control looking after itself, for a module that
// wants its own job's frequency on its own settings tab rather than sending the owner
// off to Settings. A module imports it the way it already imports TabStrip:
//
//   import { CronScheduleSetting } from '@/components/admin/CronScheduleField'
//   <CronScheduleSetting path="/api/m/unified-inbox/cron/sync" label="Check for new mail" />
//
// Both write through /api/admin/cron, so a module never needs its own route, its own
// table, or any knowledge of how the dispatcher works.

export interface CronFrequencyOption {
  value: string
  label: string
  minutes: number
}

export interface CronJobRow {
  path: string
  module: string | null
  /** The owner's pick, or null where they have left it as the author set it. */
  frequency: string | null
  /** What the job is actually running to, once any pick is applied. */
  schedule: string
  defaultSchedule: string
  defaultLabel: string
  defaultFrequency: string | null
  lastRunAt: string | null
  lastStatus: string | null
  lastError: string | null
}

export interface CronTick {
  schedule: string
  label: string
}

export interface CronSaveResult {
  job: { path: string; frequency: string | null; schedule: string }
  tick: CronTick
  tickChanged: boolean
  deploy: 'not-needed' | 'triggered' | 'unavailable'
  deployError: string | null
}

export async function saveCronFrequency(path: string, frequency: string | null): Promise<CronSaveResult> {
  const res = await fetch('/api/admin/cron', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, frequency }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error ?? 'Could not save that schedule')
  return body as CronSaveResult
}

// What a save means for the site, in words the owner can act on. A frequency change is
// unusual among settings in that it can need a deploy before it is true, and saying so
// is the difference between "it's working on it" and "it's ignoring me".
export function describeSaveResult(result: CronSaveResult): { message: string; tone: 'success' | 'warning' } {
  if (result.deploy === 'triggered') {
    return {
      message: `Saved. Your site is rebuilding so it can check this often - give it a couple of minutes.`,
      tone: 'success',
    }
  }
  if (result.deploy === 'unavailable') {
    return {
      message:
        'Saved, but the site could not be told to wake up more often - connect it to GitHub, or it will pick this up at the next update.',
      tone: 'warning',
    }
  }
  return { message: 'Saved.', tone: 'success' }
}

export function CronScheduleField({
  job,
  frequencies,
  label,
  hint,
  disabled,
  onChange,
}: {
  job: CronJobRow
  frequencies: CronFrequencyOption[]
  label?: string
  hint?: string
  disabled?: boolean
  onChange: (frequency: string | null) => void
}) {
  return (
    <div className="field" style={{ margin: 0 }}>
      {label && <label htmlFor={`cron-${job.path}`}>{label}</label>}
      <select
        id={`cron-${job.path}`}
        value={job.frequency ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
      >
        {/* Always first, and always available: the author's own timing, which for a
            weekly audit or a job with a reason to run at 3am is not one of the choices
            below and must never be lost by picking the nearest one. */}
        <option value="">Normal ({job.defaultLabel.toLowerCase()})</option>
        {frequencies.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  )
}

// The self-contained version. Renders nothing at all until it knows the job exists,
// so a module whose cron job is missing (an older core, a manifest that failed to
// parse) shows a settings tab without a broken control rather than an error.
export function CronScheduleSetting({
  path,
  label = 'How often to run',
  hint,
}: {
  path: string
  label?: string
  hint?: string
}) {
  const [job, setJob] = useState<CronJobRow | null>(null)
  const [frequencies, setFrequencies] = useState<CronFrequencyOption[]>([])
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ message: string; tone: 'success' | 'warning' | 'danger' } | null>(null)

  useEffect(() => {
    let live = true
    fetch('/api/admin/cron')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!live || !data) return
        setFrequencies(data.frequencies ?? [])
        setJob((data.jobs ?? []).find((j: CronJobRow) => j.path === path) ?? null)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [path])

  const change = useCallback(
    async (frequency: string | null) => {
      if (!job) return
      const previous = job.frequency
      // Moved before the request so the dropdown never sits on the old value while the
      // save is in flight, and put back if the save fails.
      setJob({ ...job, frequency })
      setSaving(true)
      setNotice(null)
      try {
        const result = await saveCronFrequency(path, frequency)
        setJob((current) => (current ? { ...current, ...result.job } : current))
        setNotice(describeSaveResult(result))
      } catch (err) {
        setJob({ ...job, frequency: previous })
        setNotice({ message: err instanceof Error ? err.message : 'Could not save that schedule', tone: 'danger' })
      } finally {
        setSaving(false)
      }
    },
    [job, path]
  )

  if (!job) return null

  return (
    <div>
      <CronScheduleField job={job} frequencies={frequencies} label={label} hint={hint} disabled={saving} onChange={change} />
      {notice && (
        <div className={`alert alert-${notice.tone}`} style={{ marginTop: '0.75rem' }}>
          {notice.message}
        </div>
      )}
    </div>
  )
}
