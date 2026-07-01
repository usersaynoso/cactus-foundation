'use client'

import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

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

export default function NotificationBell({ adminPath, unreadCount = 0, collapsed }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[] | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionError, setActionError] = useState<Record<string, string>>({})
  const [pos, setPos] = useState({ top: 0, left: 0 })
  // useSyncExternalStore returns false on the server and true on the client,
  // which is the React-idiomatic way to gate createPortal without a setState-in-effect.
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const base = `/${adminPath}`
  const href = `${base}/notifications`
  const label = unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'

  const fetchNotifications = useCallback(() => {
    fetch('/api/admin/notifications')
      .then(r => r.json())
      .then(data => setNotifications(data.notifications ?? []))
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
      window.location.assign('/cactus-status/redeploying')
    } catch (err: unknown) {
      setErr(id, err instanceof Error ? err.message : 'Redeploy failed')
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
      setNotifications(prev => prev?.filter(n => n.id !== id) ?? null)
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
        {unreadCount > 0 && (
          <span className="admin-sidebar-bell-count">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {dropdown}
    </>
  )
}
