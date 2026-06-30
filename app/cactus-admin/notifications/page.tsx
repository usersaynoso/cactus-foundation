import { headers } from 'next/headers'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import NotificationActions from './NotificationActions'
import type { Metadata } from 'next'
import type { NotificationType } from '@prisma/client'

export const metadata: Metadata = { title: 'Notifications — Admin' }

type NotificationReason = { label: string; detail?: string; at: string }

// Per-type presentation: leading icon, and the "View …" button label for alerts
// that carry a link (deployment notifications use their own Redeploy action).
const ICON_BY_TYPE: Record<NotificationType, string> = {
  deployment: '🚀',
  core_update: '⬆️',
  module_update: '📦',
  message: '✉️',
}

const VIEW_LABEL_BY_TYPE: Partial<Record<NotificationType, string>> = {
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

export default async function NotificationsPage() {
  const user = await getSessionFromCookie()
  if (!user) return null
  if (!await hasPermission(user, 'config.manage')) {
    return <div className="alert alert-danger">You do not have permission to view notifications.</div>
  }

  const adminPath = (await headers()).get('x-cactus-admin-path') ?? ''

  const notifications = await prisma.notification.findMany({
    orderBy: { createdAt: 'desc' },
  })

  const unread = notifications.filter((n) => !n.readAt).length

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Notifications</h1>
        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.9375rem' }}>
          {notifications.length} total{unread > 0 ? `, ${unread} unread` : ''}
        </span>
      </div>

      {notifications.length === 0 ? (
        <div className="card" style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: 'var(--space-8)' }}>
          Nothing needs your attention. Lovely.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {notifications.map((notification) => {
            const reasons = (notification.reasons as NotificationReason[] | null) ?? []
            const isDeployPending = notification.type === 'deployment' && !notification.deployInitiatedAt
            const isRead = !!notification.readAt
            const viewHref = notification.link ? `/${adminPath}${notification.link}` : null
            const viewLabel = VIEW_LABEL_BY_TYPE[notification.type] ?? null
            const icon = ICON_BY_TYPE[notification.type] ?? '🔔'

            return (
              <div key={notification.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                  <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>{icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '0.9375rem' }}>{notification.title}</strong>
                      {isDeployPending && (
                        <span className="badge badge-yellow">Awaiting deployment</span>
                      )}
                      {!isDeployPending && notification.deployInitiatedAt && (
                        <span className="badge badge-green">Deployment initiated</span>
                      )}
                      {isRead ? (
                        <span className="badge badge-gray">Read</span>
                      ) : (
                        <span className="badge badge-blue">Unread</span>
                      )}
                    </div>

                    {reasons.length > 0 && (
                      <ul style={{ margin: 'var(--space-2) 0 0 0', paddingLeft: 'var(--space-4)', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                        {reasons.map((r, i) => (
                          <li key={i}>
                            {r.label}
                            {r.detail && <span> - {r.detail}</span>}
                            <span style={{ marginLeft: 'var(--space-2)', fontSize: '0.8125rem', opacity: 0.7 }}>
                              {relativeTime(r.at)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}

                    <p style={{ margin: 'var(--space-1) 0 0 0', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                      {new Date(notification.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>

                <NotificationActions
                  id={notification.id}
                  isRead={isRead}
                  canRedeploy={isDeployPending}
                  viewHref={viewHref}
                  viewLabel={viewLabel}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
