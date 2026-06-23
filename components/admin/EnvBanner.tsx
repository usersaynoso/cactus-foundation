import { getEnvStatus } from '@/lib/config/env'

export default function EnvBanner() {
  const { optional } = getEnvStatus()
  const missing = optional.filter((v) => !v.set && v.gates)

  if (missing.length === 0) return null

  return (
    <div style={{
      background: '#fffbeb',
      borderBottom: '1px solid #fde68a',
      padding: '0.625rem 1.5rem',
      fontSize: '0.875rem',
      color: '#92400e',
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
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
        <a href="/cactus-admin/config" style={{ color: '#92400e', textDecoration: 'underline' }}>
          Configure in Settings →
        </a>
      </span>
    </div>
  )
}
