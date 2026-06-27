import { headers } from 'next/headers'
import { getEnvStatus } from '@/lib/config/env'

export default async function EnvBanner() {
  const headersList = await headers()
  const adminPath = headersList.get('x-cactus-admin-path') ?? ''
  const { optional } = getEnvStatus()
  const missing = optional.filter((v) => !v.set && v.gates)

  if (missing.length === 0) return null

  return (
    <div className="alert-warning" style={{
      borderBottom: '1px solid',
      padding: '0.625rem 1.5rem',
      fontSize: '0.875rem',
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      borderRadius: 0,
      marginBottom: 0,
    }}>
      <span>⚠️</span>
      <span>
        Some features are disabled:{' '}
        {missing.map((v, i) => (
          <span key={v.name}>
            {i > 0 && ', '}
            <strong>{v.gates}</strong>
          </span>
        ))}
        .{' '}
        <a href={`/${adminPath}/config`} style={{ textDecoration: 'underline' }}>
          Configure in Settings →
        </a>
      </span>
    </div>
  )
}
