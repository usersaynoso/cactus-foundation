'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
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
}

const ICON_BY_TYPE: Record<string, string> = {
  deployment: '🚀',
  core_update: '⬆️',
  module_update: '📦',
  message: '✉️',
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

export default function NotificationBell({ adminPath, unreadCount = 0, collapsed }: Props) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [mounted, setMounted] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const base = `/${adminPath}`
  const href = `${base}/notifications`
  const label = unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'

  useEffect(() => { setMounted(true) }, [])

  const openDropdown = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setPos({ top: rect.top, left: rect.right + 8 })
    }
    setOpen(true)
  }, [])

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch('/api/admin/notifications')
      .then(r => r.json())
      .then(data => {
        setNotifications(data.notifications ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
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
        {loading ? (
          <p className="admin-bell-dropdown-empty">Loading&hellip;</p>
        ) : notifications && notifications.length > 0 ? (
          notifications.slice(0, 5).map(n => (
            <div
              key={n.id}
              className={['admin-bell-dropdown-item', n.readAt ? '' : 'admin-bell-dropdown-item--unread'].filter(Boolean).join(' ')}
            >
              <span className="admin-bell-dropdown-icon" aria-hidden="true">
                {ICON_BY_TYPE[n.type] ?? '🔔'}
              </span>
              <div className="admin-bell-dropdown-info">
                <span className="admin-bell-dropdown-item-title">{n.title}</span>
                <span className="admin-bell-dropdown-time">{relativeTime(n.createdAt)}</span>
              </div>
            </div>
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
        <span aria-hidden="true">🔔</span>
        {unreadCount > 0 && (
          <span className="admin-sidebar-bell-count">{unreadCount}</span>
        )}
      </button>

      {dropdown}
    </>
  )
}
