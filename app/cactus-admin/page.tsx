import { getSessionFromCookie } from '@/lib/auth/session'
import { prisma } from '@/lib/db/prisma'
import { getEnvStatus } from '@/lib/config/env'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Dashboard — Admin' }

export default async function AdminDashboard() {
  const user = await getSessionFromCookie()
  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { siteName: true, status: true, timezone: true },
  })

  const [pageCount, userCount, mediaCount] = await Promise.all([
    prisma.infoPage.count(),
    prisma.user.count(),
    prisma.media.count(),
  ])

  const { required, optional } = getEnvStatus()
  const missingOptional = optional.filter((v) => !v.set && v.gates)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <span className={`badge badge-${config?.status === 'live' ? 'green' : config?.status === 'comingSoon' ? 'yellow' : 'red'}`}>
          {config?.status === 'live' ? 'Live' : config?.status === 'comingSoon' ? 'Coming soon' : 'Maintenance'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        {[
          { label: 'Pages', value: pageCount },
          { label: 'Users', value: userCount },
          { label: 'Media files', value: mediaCount },
        ].map((stat) => (
          <div key={stat.label} className="card" style={{ textAlign: 'center', padding: '1.25rem' }}>
            <div style={{ fontSize: '2rem', fontWeight: 700 }}>{stat.value}</div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {missingOptional.length > 0 && (
        <div className="card">
          <h2 className="card-title">Optional features not yet configured</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {missingOptional.map((v) => (
              <div key={v.name} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontSize: '0.9375rem' }}>
                <span style={{ color: '#d97706' }}>○</span>
                <div>
                  <code style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>{v.name}</code>
                  <span style={{ color: '#6b7280', fontSize: '0.875rem' }}> — {v.gates}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9375rem' }}>
          Logged in as <strong>{user?.username}</strong> ({user?.role.name})
        </p>
      </div>
    </div>
  )
}
