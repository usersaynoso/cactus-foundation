'use client'

// Settings -> Backup & restore -> Automatic backups. On a site that runs on its own
// server, cactus-host takes a real copy of the database on the schedule set here and
// sends it to a folder in the site's own storage (picked in the media picker's folder
// view, which walks the bucket itself), deleting copies older than the days kept. The
// route behind it is app/api/admin/backup/automatic; the work is cactus-host/backups.ts.

import { useCallback, useEffect, useState } from 'react'
import type { BackupEvery, BackupSchedule, SiteBackupState } from '@/cactus-host/protocol'
import { InfoTip } from '@/components/admin/InfoTip'
import { MediaPickerModal } from '@/components/admin/MediaPickerModal'

type Storage = { provider: string; label: string; bucket: string; supported: boolean }

type Status = {
  available: boolean
  reason: string | null
  storage: Storage | null
  backup: SiteBackupState | null
}

const EVERY_LABELS: Record<BackupEvery, string> = {
  off: 'Off',
  '6h': 'Every 6 hours',
  '12h': 'Every 12 hours',
  daily: 'Once a day',
  weekly: 'Once a week (Sundays)',
}

const muted = { fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: '0 0 1rem' } as const
const label = { display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: '0.375rem' } as const

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function formatSize(bytes: number | null): string {
  if (bytes === null) return ''
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function when(ms: number): string {
  return new Date(ms).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

async function readStatus(): Promise<Status | { error: string }> {
  try {
    const res = await fetch('/api/admin/backup/automatic')
    const data = (await res.json()) as Status & { error?: string }
    return res.ok ? data : { error: data.error ?? 'Could not read the backup settings.' }
  } catch {
    return { error: 'Could not reach the site. Check your connection and try again.' }
  }
}

// `id` is the settings anchor, passed in so the page that links to it names it.
export default function AutomaticBackupsCard({ id }: { id: string }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [loadError, setLoadError] = useState('')
  const [schedule, setSchedule] = useState<BackupSchedule | null>(null)
  const [folder, setFolder] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [starting, setStarting] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const apply = useCallback((next: Status) => {
    setStatus(next)
    if (next.backup) setSchedule(next.backup.schedule)
  }, [])

  const refresh = useCallback(async () => {
    const next = await readStatus()
    if ('error' in next) setLoadError(next.error)
    else {
      setLoadError('')
      setStatus(next)
    }
    return next
  }, [])

  useEffect(() => {
    let cancelled = false
    void readStatus().then((next) => {
      if (cancelled) return
      if ('error' in next) setLoadError(next.error)
      else apply(next)
    })
    return () => { cancelled = true }
  }, [apply])

  // While a backup runs, check on it now and then so the result shows without a reload.
  const running = status?.backup?.running ?? false
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => { void refresh() }, 5000)
    return () => clearInterval(timer)
  }, [running, refresh])

  const backup = status?.backup ?? null
  const location = backup?.location ?? null
  const currentFolder = folder ?? location?.folder ?? null
  const dirty =
    folder !== null ||
    (schedule !== null && backup !== null && JSON.stringify(schedule) !== JSON.stringify(backup.schedule))

  async function save() {
    if (!schedule) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/backup/automatic', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule, ...(folder !== null ? { folder } : {}) }),
      })
      const data = (await res.json()) as { backup?: SiteBackupState; error?: string }
      if (!res.ok || !data.backup) throw new Error(data.error ?? 'That did not save.')
      setFolder(null)
      if (status) apply({ ...status, backup: data.backup })
      setMessage({ kind: 'ok', text: 'Saved.' })
    } catch (err: unknown) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'That did not save.' })
    } finally {
      setSaving(false)
    }
  }

  async function backUpNow() {
    setStarting(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/backup/automatic', { method: 'POST' })
      const data = (await res.json()) as { started?: boolean; backup?: SiteBackupState; error?: string }
      if (!res.ok || !data.backup) throw new Error(data.error ?? 'The backup did not start.')
      if (status) setStatus({ ...status, backup: data.backup })
      setMessage({ kind: 'ok', text: data.started ? 'Backing up now. This page updates when it is done.' : 'A backup is already under way.' })
    } catch (err: unknown) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'The backup did not start.' })
    } finally {
      setStarting(false)
    }
  }

  const storage = status?.storage ?? null
  const otherBucket = location && storage?.bucket && location.bucket !== storage.bucket

  return (
    <div id={id} className="card admin-anchor">
      <div className="card-title">
        Automatic backups{' '}
        <InfoTip>
          Your server takes a full copy of the database on the schedule below and keeps it in a folder in your own
          storage, beside your media but never inside it. Copies older than the days you keep are deleted from there.
          Restore one with the server&apos;s restore tools, or ask whoever runs your server.
        </InfoTip>
      </div>

      {!status && !loadError && <p style={muted}>Checking with your server…</p>}
      {loadError && <div className="alert alert-danger" style={{ fontSize: '0.875rem' }}>{loadError}</div>}
      {status && !status.available && <p style={muted}>{status.reason}</p>}

      {status?.available && backup && !backup.database && (
        <p style={muted}>This site&apos;s database is not on its server, so the server has nothing of its own to back up.</p>
      )}

      {status?.available && backup?.database && schedule && (
        <>
          <div style={{ marginBottom: '1rem' }}>
            <span style={label}>Saved to</span>
            {currentFolder ? (
              <p style={{ margin: '0 0 0.5rem', fontSize: 'var(--text-sm)' }}>
                {location && folder === null ? location.bucket : storage?.bucket || 'Your bucket'}
                {' / '}
                <code>{currentFolder}</code>
                {folder !== null && <span style={{ color: 'var(--color-text-muted)' }}> (not saved yet)</span>}
              </p>
            ) : backup.destination ? (
              <p style={{ margin: '0 0 0.5rem', fontSize: 'var(--text-sm)' }}><code>{backup.destination}</code></p>
            ) : (
              <p style={{ margin: '0 0 0.5rem', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                Only on the server itself. Pick a folder so a copy lives somewhere else too.
              </p>
            )}
            {otherBucket && folder === null && (
              <p style={{ ...muted, margin: '0 0 0.5rem' }}>
                That is not the bucket your media uses ({storage?.bucket}). Picking a folder below moves the copies into
                your own bucket.
              </p>
            )}
            {storage?.supported ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPicking(true)}>
                {currentFolder || backup.destination ? 'Change folder' : 'Choose a folder'}
              </button>
            ) : (
              <p style={{ ...muted, margin: 0 }}>
                Backups can be kept in Backblaze B2, Cloudflare R2, Amazon S3, DigitalOcean Spaces, Wasabi or MinIO.
                Connect one under Settings &gt; Media to choose a folder.
              </p>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={label} htmlFor="auto-backup-every">How often</label>
              <select
                id="auto-backup-every"
                value={schedule.every}
                onChange={(e) => setSchedule({ ...schedule, every: e.target.value as BackupEvery })}
              >
                {(Object.keys(EVERY_LABELS) as BackupEvery[]).map((key) => (
                  <option key={key} value={key}>{EVERY_LABELS[key]}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={label} htmlFor="auto-backup-time">
                {schedule.every === '6h' || schedule.every === '12h' ? 'Starting at (UTC)' : 'At (UTC)'}
              </label>
              <input
                id="auto-backup-time"
                type="time"
                value={`${pad(schedule.hour)}:${pad(schedule.minute)}`}
                disabled={schedule.every === 'off'}
                onChange={(e) => {
                  const m = /^(\d{2}):(\d{2})$/.exec(e.target.value)
                  if (m) setSchedule({ ...schedule, hour: Number(m[1]), minute: Number(m[2]) })
                }}
              />
            </div>
            <div>
              <label style={label} htmlFor="auto-backup-keep">Keep copies for (days)</label>
              <input
                id="auto-backup-keep"
                type="number"
                min={1}
                max={3650}
                value={schedule.keepDays}
                onChange={(e) => {
                  const n = Math.round(Number(e.target.value))
                  if (Number.isFinite(n)) setSchedule({ ...schedule, keepDays: Math.min(3650, Math.max(1, n)) })
                }}
                style={{ width: '6rem' }}
              />
            </div>
          </div>
          {schedule.every === 'off' && backup.destination && (
            <p style={muted}>
              The server&apos;s own schedule is off for this site. A nightly job set up on the server by hand, if there
              is one, still copies here.
            </p>
          )}

          <p style={{ ...muted, margin: '0 0 1rem' }}>
            {backup.running
              ? 'A backup is running now.'
              : backup.lastRun
                ? backup.lastRun.ok
                  ? `Last backup ${when(backup.lastRun.at)}, ${formatSize(backup.lastRun.sizeBytes)}${backup.lastRun.copiedTo ? '' : ', kept on the server only'}.`
                  : `The last backup, ${when(backup.lastRun.at)}, failed: ${backup.lastRun.error ?? 'no reason given'}`
                : 'No automatic backup has run yet.'}
          </p>

          {message && (
            <div className={`alert ${message.kind === 'ok' ? 'alert-success' : 'alert-danger'}`} style={{ marginBottom: '1rem', fontSize: '0.875rem' }}>
              {message.text}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" disabled={!dirty || saving} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="btn btn-secondary" disabled={backup.running || starting || dirty} onClick={() => void backUpNow()}>
              {starting ? 'Starting…' : 'Back up now'}
            </button>
          </div>
        </>
      )}

      {picking && (
        <MediaPickerModal
          mode="folder"
          title="Where should backups go?"
          chooseLabel="Save backups here"
          refusePublic
          initialFolder={location && storage && location.bucket === storage.bucket ? (currentFolder ?? '') : ''}
          onClose={() => setPicking(false)}
          onChoose={(chosen) => {
            setPicking(false)
            setFolder(chosen === location?.folder && location?.bucket === storage?.bucket ? null : chosen)
          }}
        />
      )}
    </div>
  )
}
