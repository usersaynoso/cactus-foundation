'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CronScheduleField,
  describeSaveResult,
  saveCronFrequency,
  type CronFrequencyOption,
  type CronJobRow,
  type CronTick,
} from '@/components/admin/CronScheduleField'

// Settings > Schedules. Every job this site runs on a timer, whether it came with the
// site or with a module, and how often the owner would like each one to happen.
//
// Grouped by what owns the job rather than listed flat, because "why is my site doing
// this at all" is answered by the group heading and nothing else on the row.

type Payload = { tick: CronTick; frequencies: CronFrequencyOption[]; jobs: CronJobRow[] }

// A job's path is its identity, not its name. `/api/m/unified-inbox/cron/sync` is
// "Sync"; `/api/cron/members/digest?mode=daily` is "Members digest (daily)". Nobody
// should have to read a URL to find out what their website is busy with.
function jobName(path: string): string {
  const [route, query] = path.split('?')
  const after = route!.split('/cron/')[1] ?? route!
  const words = after
    .split('/')
    .join(' ')
    .replace(/-/g, ' ')
    .trim()
  const name = words.charAt(0).toUpperCase() + words.slice(1)
  if (!query) return name
  const values = [...new URLSearchParams(query).values()]
  return values.length ? `${name} (${values.join(', ')})` : name
}

function groupName(module: string | null): string {
  if (!module) return 'Your website'
  return module.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())
}

function lastRunText(job: CronJobRow): string {
  if (!job.lastRunAt) return 'Not yet'
  const when = new Date(job.lastRunAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
  if (job.lastStatus === 'failed') return `${when} - did not finish`
  if (job.lastStatus === 'seeded') return 'Waiting for its first run'
  return when
}

export default function ScheduledJobsClient() {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingPath, setSavingPath] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ message: string; tone: 'success' | 'warning' | 'danger' } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    fetch('/api/admin/cron')
      .then(async (r) => {
        const body = await r.json().catch(() => null)
        if (!r.ok) throw new Error(body?.error ?? 'Could not load the schedules')
        return body as Payload
      })
      .then((body) => live && setData(body))
      .catch((err) => live && setError(err instanceof Error ? err.message : String(err)))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [])

  const groups = useMemo(() => {
    if (!data) return []
    const byModule = new Map<string | null, CronJobRow[]>()
    for (const job of data.jobs) {
      const list = byModule.get(job.module) ?? []
      list.push(job)
      byModule.set(job.module, list)
    }
    // The site's own jobs first, then each module alphabetically - the same order the
    // rest of Settings puts core before modules.
    return [...byModule.entries()]
      .sort((a, b) => {
        if (a[0] === null) return -1
        if (b[0] === null) return 1
        return a[0].localeCompare(b[0])
      })
      .map(([module, jobs]) => ({
        module,
        name: groupName(module),
        jobs: [...jobs].sort((a, b) => jobName(a.path).localeCompare(jobName(b.path))),
      }))
  }, [data])

  const change = useCallback(
    async (job: CronJobRow, frequency: string | null) => {
      if (!data) return
      const previous = job.frequency
      const apply = (value: string | null, schedule?: string) =>
        setData((current) =>
          current
            ? {
                ...current,
                jobs: current.jobs.map((j) =>
                  j.path === job.path ? { ...j, frequency: value, schedule: schedule ?? j.schedule } : j
                ),
              }
            : current
        )

      apply(frequency)
      setSavingPath(job.path)
      setNotice(null)
      try {
        const result = await saveCronFrequency(job.path, frequency)
        apply(result.job.frequency, result.job.schedule)
        setData((current) => (current ? { ...current, tick: result.tick } : current))
        setNotice(describeSaveResult(result))
      } catch (err) {
        apply(previous)
        setNotice({ message: err instanceof Error ? err.message : 'Could not save that schedule', tone: 'danger' })
      } finally {
        setSavingPath(null)
      }
    },
    [data]
  )

  if (loading) return <div style={{ color: 'var(--color-text-muted)' }}>Loading…</div>
  if (error) return <div className="alert alert-danger">{error}</div>
  if (!data) return null

  return (
    <div>
      <div className="alert alert-info" style={{ marginBottom: '1.5rem' }}>
        <strong>Your site wakes up {data.tick.label.toLowerCase()}.</strong> That is set for you from whichever job
        below runs most often, and it is the soonest anything here can happen. Asking for something faster than your
        site currently wakes up rebuilds the site, which takes a minute or two and needs it connected to GitHub.
      </div>

      {notice && (
        <div className={`alert alert-${notice.tone}`} style={{ marginBottom: '1.5rem' }}>
          {notice.message}
        </div>
      )}

      {groups.map((group) => (
        <div key={group.module ?? 'core'} className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-title">{group.name}</div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Job</th>
                  <th style={{ width: '16rem' }}>How often</th>
                  <th>Last run</th>
                </tr>
              </thead>
              <tbody>
                {group.jobs.map((job) => (
                  <tr key={job.path}>
                    <td>{jobName(job.path)}</td>
                    <td>
                      <CronScheduleField
                        job={job}
                        frequencies={data.frequencies}
                        disabled={savingPath === job.path}
                        onChange={(frequency) => change(job, frequency)}
                      />
                    </td>
                    <td style={{ color: 'var(--color-text-muted)' }}>
                      {lastRunText(job)}
                      {job.lastStatus === 'failed' && job.lastError && (
                        <div style={{ fontSize: '0.8125rem' }}>{job.lastError}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {groups.length === 0 && (
        <div style={{ color: 'var(--color-text-muted)' }}>
          Nothing on this site runs to a timer yet. Modules that need one add it here when you install them.
        </div>
      )}
    </div>
  )
}
