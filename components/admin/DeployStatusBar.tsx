'use client'
import { useSyncExternalStore } from 'react'
import {
  deployStateLabel,
  dismissDeployStatus,
  getDeployStatus,
  getServerDeployStatus,
  subscribeDeployStatus,
} from '@/lib/deploy-status-client'

// Slim full-width strip pinned to the very top of the admin shell while a
// redeploy is in flight. Reads from the shared deploy-status store (see
// lib/deploy-status-client.ts) - the notification bell shows the detailed
// log view; this bar is just the always-visible headline.
export default function DeployStatusBar() {
  const status = useSyncExternalStore(subscribeDeployStatus, getDeployStatus, getServerDeployStatus)

  if (!status.active) return null

  const { failed, state, lines } = status
  const latestLine = lines.length > 0 ? lines[lines.length - 1] : ''

  return (
    <div
      className="admin-deploy-bar"
      style={{
        background: failed ? 'var(--color-error-bg)' : 'var(--color-primary-subtle)',
        borderBottom: `1px solid ${failed ? 'var(--color-destructive-border)' : 'var(--color-border)'}`,
      }}
    >
      {!failed && <span className="setup-spinner admin-deploy-bar-spinner" style={{ color: 'var(--color-primary)' }} />}
      <span className={`badge ${failed ? 'badge-danger' : 'badge-info'}`}>{deployStateLabel(state, failed)}</span>
      <span className="admin-deploy-bar-message">
        {failed ? 'Your changes may not have taken effect.' : (latestLine || 'Applying your changes and bringing the site back up.')}
      </span>
      {failed && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => dismissDeployStatus()}>Dismiss</button>
      )}
    </div>
  )
}
