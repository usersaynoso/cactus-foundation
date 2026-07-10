'use client'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import {
  deployStateLabel,
  dismissDeployStatus,
  getDeployStatus,
  getServerDeployStatus,
  subscribeDeployStatus,
} from '@/lib/deploy-status-client'

// Live view of an in-flight redeploy: shared between the notification bell
// dropdown and the full notifications page so both read the same store (see
// lib/deploy-status-client.ts) and never disagree.
export default function DeployStatusLive() {
  const status = useSyncExternalStore(subscribeDeployStatus, getDeployStatus, getServerDeployStatus)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [status.lines.length])

  if (!status.active) return null

  const { failed, state, lines } = status

  return (
    <div className={['admin-bell-deploy', failed ? 'admin-bell-deploy--failed' : ''].filter(Boolean).join(' ')}>
      <div className="admin-bell-deploy-top">
        {!failed && <span className="setup-spinner admin-bell-deploy-spinner" style={{ color: 'var(--color-primary)' }} />}
        <span className="admin-bell-deploy-title">
          {failed ? 'Redeploy failed' : 'Redeploying your site'}
        </span>
        <span className={`badge ${failed ? 'badge-danger' : 'badge-info'}`}>{deployStateLabel(state, failed)}</span>
      </div>
      <div className="admin-bell-deploy-log" ref={logRef}>
        {lines.length > 0 ? (
          lines.map((line, i) => (
            <div
              key={i}
              className={['admin-bell-deploy-line', i === lines.length - 1 ? 'admin-bell-deploy-line--latest' : ''].filter(Boolean).join(' ')}
            >
              {line}
            </div>
          ))
        ) : (
          <div className="admin-bell-deploy-line">
            {failed ? 'Your changes may not have taken effect.' : 'Applying your changes and bringing the site back up.'}
          </div>
        )}
      </div>
      {failed && (
        <div className="admin-bell-deploy-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => dismissDeployStatus()}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}
