'use client'

import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DeployStatusLive from './DeployStatusLive'
import {
  REDEPLOY_STARTED_EVENT,
  announceRedeployStarted,
  getDeployStatus,
  getServerDeployStatus,
  subscribeDeployStatus,
} from '@/lib/deploy-status-client'
import {
  UPLOAD_STARTED_EVENT,
  type UploadTask,
  type UploadSnapshot,
  clearFinishedUploads,
  dismissUpload,
  getServerUploadSnapshot,
  getUploadSnapshot,
  subscribeUploads,
} from '@/lib/upload-status-client'
import { formatBytes } from '@/app/cactus-admin/media/format'

type Props = {
  adminPath: string
  unreadCount?: number
  collapsed?: boolean
}

type Notification = {
  id: string
  title: string
  type: string
  createdAt: string
  readAt: string | null
  link: string | null
  deployInitiatedAt: string | null
}

// How often the bell asks the server for new notifications while the tab is in
// front. Every open admin tab polls, so this is deliberately unhurried.
const POLL_INTERVAL_MS = 60_000

const ICON_BY_TYPE: Record<string, string> = {
  deployment: '🚀',
  core_update: '⬆️',
  module_update: '📦',
  message: '✉️',
}

const VIEW_LABEL_BY_TYPE: Record<string, string> = {
  core_update: 'View Update',
  module_update: 'View Update',
  message: 'View Messages',
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

function NotificationItem({
  n,
  adminPath,
  actionLoading,
  actionError,
  onView,
  onRedeploy,
  onToggleRead,
  onDelete,
}: {
  n: Notification
  adminPath: string
  actionLoading: string | null
  actionError: Record<string, string>
  onView: (n: Notification) => void
  onRedeploy: (id: string) => void
  onToggleRead: (id: string, isRead: boolean) => void
  onDelete: (id: string) => void
}) {
  const isRead = !!n.readAt
  const isDeployPending = n.type === 'deployment' && !n.deployInitiatedAt
  const viewLabel = VIEW_LABEL_BY_TYPE[n.type]
  const viewHref = n.link ? `/${adminPath}${n.link}` : null
  const busy = actionLoading === n.id
  const err = actionError[n.id]

  return (
    <div className={['admin-bell-dropdown-item', isRead ? '' : 'admin-bell-dropdown-item--unread'].filter(Boolean).join(' ')}>
      <div className="admin-bell-dropdown-item-top">
        <span className="admin-bell-dropdown-icon" aria-hidden="true">
          {ICON_BY_TYPE[n.type] ?? '🔔'}
        </span>
        <div className="admin-bell-dropdown-info">
          <span className="admin-bell-dropdown-item-title">{n.title}</span>
          <span className="admin-bell-dropdown-time">{relativeTime(n.createdAt)}</span>
        </div>
      </div>
      {err && (
        <p className="admin-bell-dropdown-action-error">{err}</p>
      )}
      <div className="admin-bell-dropdown-actions">
        {viewHref && viewLabel && (
          <button
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={() => onView(n)}
          >
            {viewLabel}
          </button>
        )}
        {isDeployPending && (
          <button
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={() => onRedeploy(n.id)}
          >
            Redeploy now
          </button>
        )}
        <button
          className="btn btn-secondary btn-sm"
          disabled={busy}
          onClick={() => onToggleRead(n.id, isRead)}
        >
          {isRead ? 'Mark unread' : 'Mark read'}
        </button>
        <button
          className="btn btn-danger btn-sm"
          disabled={busy}
          onClick={() => onDelete(n.id)}
        >
          Delete
        </button>
      </div>
    </div>
  )
}

function uploadGlyph(s: UploadTask['status']): string {
  return s === 'done' ? '✓' : s === 'error' ? '⚠' : s === 'skipped' ? '–' : '↑'
}

// The live upload batch, rendered as its own section at the top of the bell
// dropdown. These are ephemeral and have no read/unread state - just progress,
// with a Clear for finished files and a per-file dismiss.
//
// It renders the pre-aggregated snapshot, not the raw task list: a 25,000-file
// drop is summarised by its totals and one overall bar, with only the failures
// and the handful in flight listed by name (`snapshot.visible`, capped upstream).
// Listing every file meant thousands of DOM rows repainting on every progress
// tick, which locked the page - the whole reason a big upload looked stuck.
function UploadSection({ snapshot, onClear, onDismiss }: {
  snapshot: UploadSnapshot
  onClear: () => void
  onDismiss: (id: string) => void
}) {
  const { total, active, done, failed, skipped, overallProgress, visible, hidden } = snapshot
  if (total === 0) return null

  const title = active > 0
    ? `Uploading ${active.toLocaleString('en-GB')} file${active === 1 ? '' : 's'}…`
    : failed > 0
      ? `${done.toLocaleString('en-GB')} uploaded, ${failed.toLocaleString('en-GB')} failed`
      : `Uploaded ${done.toLocaleString('en-GB')} file${done === 1 ? '' : 's'}`
  // How many finished, out of the whole batch - the honest denominator while
  // thousands are still queued, so the bar doesn't read as "nearly done" at the
  // start of a huge drop.
  const settled = done + failed + skipped

  return (
    <div className="admin-bell-uploads" role="status" aria-live="polite">
      <div className="admin-bell-uploads-head">
        <span className="admin-bell-uploads-title">{title}</span>
        {active === 0 && (
          <button type="button" className="admin-bell-uploads-clear" onClick={onClear}>Clear</button>
        )}
      </div>
      {active > 0 && (
        <div className="admin-bell-uploads-overall">
          <div className="admin-bell-upload-track">
            <div className="admin-bell-upload-fill" style={{ width: `${Math.round(overallProgress * 100)}%` }} />
          </div>
          <span className="admin-bell-uploads-count">{settled.toLocaleString('en-GB')} of {total.toLocaleString('en-GB')}</span>
        </div>
      )}
      <ul className="admin-bell-uploads-list">
        {visible.map((t) => {
          const finished = t.status === 'done' || t.status === 'error' || t.status === 'skipped'
          return (
            <li key={t.id} className="admin-bell-upload-row">
              <span aria-hidden="true" className={`admin-bell-upload-glyph admin-bell-upload-glyph--${t.status}`}>{uploadGlyph(t.status)}</span>
              <div className="admin-bell-upload-main">
                <div className="admin-bell-upload-line">
                  <span className="admin-bell-upload-name">{t.name}</span>
                  <span className="admin-bell-upload-size">{formatBytes(t.size)}</span>
                </div>
                {t.status === 'uploading' || t.status === 'queued' ? (
                  <div className="admin-bell-upload-track">
                    <div className="admin-bell-upload-fill" style={{ width: `${Math.round((t.status === 'uploading' ? t.progress : 0) * 100)}%` }} />
                  </div>
                ) : t.error ? (
                  <div className="admin-bell-upload-error">{t.error}</div>
                ) : (
                  <div className="admin-bell-upload-meta">{t.status === 'skipped' ? 'Skipped' : `Uploaded to ${t.destination}`}</div>
                )}
              </div>
              {finished && (
                <button type="button" className="admin-bell-upload-dismiss" aria-label={`Dismiss ${t.name}`} onClick={() => onDismiss(t.id)}>×</button>
              )}
            </li>
          )
        })}
      </ul>
      {hidden > 0 && (
        <p className="admin-bell-uploads-more">…and {hidden.toLocaleString('en-GB')} more</p>
      )}
    </div>
  )
}

export default function NotificationBell({ adminPath, unreadCount = 0, collapsed }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[] | null>(null)
  const [count, setCount] = useState(unreadCount)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionError, setActionError] = useState<Record<string, string>>({})
  const [pos, setPos] = useState({ top: 0, left: 0 })
  // useSyncExternalStore returns false on the server and true on the client,
  // which is the React-idiomatic way to gate createPortal without a setState-in-effect.
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false)
  const deployStatus = useSyncExternalStore(subscribeDeployStatus, getDeployStatus, getServerDeployStatus)
  const uploads = useSyncExternalStore(subscribeUploads, getUploadSnapshot, getServerUploadSnapshot)
  const activeUploads = uploads.active
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const base = `/${adminPath}`
  const href = `${base}/notifications`
  const label = deployStatus.active
    ? 'Notifications (redeploying)'
    : activeUploads > 0
      ? `Notifications (uploading ${activeUploads} file${activeUploads === 1 ? '' : 's'})`
      : count > 0 ? `Notifications (${count} unread)` : 'Notifications'

  const fetchNotifications = useCallback(() => {
    fetch('/api/admin/notifications')
      .then(r => r.json())
      .then(data => {
        setNotifications(data.notifications ?? [])
        setCount(data.unreadCount ?? 0)
      })
      .catch(() => setNotifications([]))
  }, [])

  const openDropdown = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setPos({ top: rect.top, left: rect.right + 8 })
    }
    setOpen(true)
  }, [])

  useEffect(() => {
    if (!open) return
    fetchNotifications()
  }, [open, fetchNotifications])

  // Any admin action that kicks off a redeploy broadcasts this event — pop the
  // dropdown open so the live deploy status is immediately in view.
  useEffect(() => {
    function onRedeployStarted() {
      openDropdown()
    }
    window.addEventListener(REDEPLOY_STARTED_EVENT, onRedeployStarted)
    return () => window.removeEventListener(REDEPLOY_STARTED_EVENT, onRedeployStarted)
  }, [openDropdown])

  // A fresh upload batch pops the dropdown open too, so progress is never a
  // silent spinner now that the floating panel is gone.
  useEffect(() => {
    function onUploadStarted() {
      openDropdown()
    }
    window.addEventListener(UPLOAD_STARTED_EVENT, onUploadStarted)
    return () => window.removeEventListener(UPLOAD_STARTED_EVENT, onUploadStarted)
  }, [openDropdown])

  // Poll for new notifications so the badge updates live, not just on
  // full page reload / next server-rendered layout pass.
  //
  // Polling stops while the tab is hidden and catches up the moment it comes back,
  // so a forgotten background tab isn't quietly hammering the database for hours.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null

    const poll = () => {
      fetch('/api/admin/notifications')
        .then(r => r.json())
        .then(data => {
          setCount(data.unreadCount ?? 0)
          if (open) setNotifications(data.notifications ?? [])
        })
        .catch(() => {})
    }

    const start = () => {
      if (timer === null) timer = setInterval(poll, POLL_INTERVAL_MS)
    }
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        poll()
        start()
      } else {
        stop()
      }
    }

    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (
        buttonRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      ) return
      setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const setErr = (id: string, msg: string) =>
    setActionError(prev => ({ ...prev, [id]: msg }))

  const clearErr = (id: string) =>
    setActionError(prev => { const next = { ...prev }; delete next[id]; return next })

  async function handleView(n: Notification) {
    const href = `/${adminPath}${n.link}`
    setActionLoading(n.id)
    clearErr(n.id)
    if (!n.readAt) {
      await fetch(`/api/admin/notifications/${n.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: true }),
      }).catch(() => {})
      setCount(prev => Math.max(0, prev - 1))
    }
    setOpen(false)
    router.push(href)
  }

  async function handleRedeploy(id: string) {
    setActionLoading(id)
    clearErr(id)
    try {
      const res = await fetch(`/api/admin/notifications/${id}/redeploy`, { method: 'POST' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Redeploy failed')
      announceRedeployStarted()
      fetchNotifications()
      router.refresh()
    } catch (err: unknown) {
      setErr(id, err instanceof Error ? err.message : 'Redeploy failed')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleToggleRead(id: string, isRead: boolean) {
    setActionLoading(id)
    clearErr(id)
    try {
      const res = await fetch(`/api/admin/notifications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: !isRead }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Action failed')
      setNotifications(prev => prev?.map(n => n.id === id ? { ...n, readAt: isRead ? null : new Date().toISOString() } : n) ?? null)
      setCount(prev => isRead ? prev + 1 : Math.max(0, prev - 1))
      router.refresh()
    } catch (err: unknown) {
      setErr(id, err instanceof Error ? err.message : 'Action failed')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this notification? This cannot be undone.')) return
    setActionLoading(id)
    clearErr(id)
    try {
      const res = await fetch(`/api/admin/notifications/${id}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Delete failed')
      setNotifications(prev => {
        const deleted = prev?.find(n => n.id === id)
        if (deleted && !deleted.readAt) setCount(c => Math.max(0, c - 1))
        return prev?.filter(n => n.id !== id) ?? null
      })
      router.refresh()
    } catch (err: unknown) {
      setErr(id, err instanceof Error ? err.message : 'Delete failed')
      setActionLoading(null)
    }
  }

  const dropdown = open && mounted ? createPortal(
    <div
      ref={dropdownRef}
      className="admin-bell-dropdown"
      style={{ top: pos.top, left: pos.left }}
      role="dialog"
      aria-label="Notifications"
    >
      <div className="admin-bell-dropdown-header">
        <span className="admin-bell-dropdown-title">Notifications</span>
      </div>

      <DeployStatusLive />

      <UploadSection snapshot={uploads} onClear={clearFinishedUploads} onDismiss={dismissUpload} />

      <div className="admin-bell-dropdown-body">
        {notifications === null ? (
          <p className="admin-bell-dropdown-empty">Loading&hellip;</p>
        ) : notifications.length > 0 ? (
          notifications.slice(0, 5).map(n => (
            <NotificationItem
              key={n.id}
              n={n}
              adminPath={adminPath}
              actionLoading={actionLoading}
              actionError={actionError}
              onView={handleView}
              onRedeploy={handleRedeploy}
              onToggleRead={handleToggleRead}
              onDelete={handleDelete}
            />
          ))
        ) : (
          <p className="admin-bell-dropdown-empty">Nothing needs your attention. Lovely.</p>
        )}
      </div>

      <div className="admin-bell-dropdown-footer">
        <Link
          href={href}
          className="admin-bell-dropdown-viewall"
          onClick={() => setOpen(false)}
        >
          View all notifications
        </Link>
      </div>
    </div>,
    document.body
  ) : null

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={[
          'admin-sidebar-bell',
          collapsed ? '' : 'admin-sidebar-bell--inline',
          open ? 'admin-sidebar-bell--open' : '',
        ].filter(Boolean).join(' ')}
        title={label}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => (open ? setOpen(false) : openDropdown())}
      >
        <svg
          aria-hidden="true"
          className="admin-sidebar-bell-icon"
          viewBox="0 0 24 24"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M12 2a1 1 0 0 1 1 1v.5a7 7 0 0 1 6 6.9V15l1.7 2.3A1 1 0 0 1 19.9 19H4.1a1 1 0 0 1-.8-1.6L5 15v-4.6A7 7 0 0 1 11 3.5V3a1 1 0 0 1 1-1Z" />
          <path d="M10 19a2 2 0 1 0 4 0h-4Z" />
        </svg>
        {deployStatus.active || activeUploads > 0 ? (
          <span className="admin-sidebar-bell-spinner setup-spinner" aria-hidden="true" />
        ) : count > 0 && (
          <span className="admin-sidebar-bell-count">{count > 99 ? '99+' : count}</span>
        )}
      </button>

      {dropdown}
    </>
  )
}
