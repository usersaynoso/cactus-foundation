'use client'

import { useState, useEffect } from 'react'

type Props = {
  notificationId: string
  adminPath: string
}

export default function PendingDeployBanner({ notificationId, adminPath }: Props) {
  const sessionKey = `cactus-pending-deploy-dismissed-${notificationId}`
  const [dismissed, setDismissed] = useState<boolean | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage is browser-only; this effect is the only valid place to read it
    setDismissed(sessionStorage.getItem(sessionKey) !== null)
  }, [sessionKey])

  if (dismissed === null || dismissed) return null

  return (
    <div
      className="alert-warning"
      style={{
        borderBottom: '1px solid',
        padding: '0.625rem 1.5rem',
        fontSize: '0.875rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        borderRadius: 0,
        marginBottom: 0,
      }}
    >
      <span>🚀</span>
      <span style={{ flex: 1 }}>
        Changes are waiting to go live.{' '}
        <a href={`/${adminPath}/notifications`} style={{ textDecoration: 'underline' }}>
          Review and redeploy →
        </a>
      </span>
      <button
        onClick={() => {
          sessionStorage.setItem(sessionKey, '1')
          setDismissed(true)
        }}
        aria-label="Dismiss"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: '1rem',
          lineHeight: 1,
          padding: '0 0.25rem',
          color: 'inherit',
          opacity: 0.7,
        }}
      >
        ×
      </button>
    </div>
  )
}
