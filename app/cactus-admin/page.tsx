import { headers } from 'next/headers'
import { getSessionFromCookie } from '@/lib/auth/session'
import { prisma } from '@/lib/db/prisma'
import { isMediaProviderConfigured, isGitHubConfigured } from '@/lib/config/env'
import type { Metadata } from 'next'
import type { MediaProviderType } from '@prisma/client'

export const metadata: Metadata = { title: 'Dashboard — Admin' }

type FeatureItem = {
  id: string
  name: string
  description: string
  configured: boolean
  settingsTab: string
  hint: string
}

export default async function AdminDashboard() {
  const headersList = await headers()
  const adminPath = headersList.get('x-cactus-admin-path') ?? ''
  const user = await getSessionFromCookie()
  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { siteName: true, status: true, timezone: true, mediaProvider: true },
  })

  const [pageCount, userCount, mediaCount] = await Promise.all([
    prisma.infoPage.count(),
    prisma.user.count(),
    prisma.media.count(),
  ])

  const emailConfigured = !!(process.env.BREVO_API_KEY || process.env.SMTP_HOST)
  const activeProvider = config?.mediaProvider as MediaProviderType | null
  const mediaConfigured = !!(activeProvider && isMediaProviderConfigured(activeProvider))
  const botProtectionConfigured = !!(process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY)
  const edgeConfigConfigured = !!(process.env.EDGE_CONFIG && process.env.VERCEL_EDGE_CONFIG_ID)
  const githubConfigured = await isGitHubConfigured()
  const sentryConfigured = !!process.env.SENTRY_DSN

  const features: FeatureItem[] = [
    {
      id: 'media',
      name: 'Image storage',
      description: 'Upload images, set a logo, and add a favicon to your site.',
      configured: mediaConfigured,
      settingsTab: 'media',
      hint: 'Connect a storage provider such as Backblaze B2, Cloudflare R2, or an image CDN.',
    },
    {
      id: 'email',
      name: 'Email',
      description: 'Send password reset links, verification emails, and OTP codes.',
      configured: emailConfigured,
      settingsTab: 'email',
      hint: 'Add a Brevo API key or SMTP credentials.',
    },
    {
      id: 'bot',
      name: 'Bot protection',
      description: 'Guard public forms against spam with Cloudflare Turnstile.',
      configured: botProtectionConfigured,
      settingsTab: 'integrations',
      hint: 'Add your Turnstile site key and secret key.',
    },
    {
      id: 'edge',
      name: 'Edge Config',
      description: 'Instantly serve your admin URL and site status from Vercel\'s global edge network.',
      configured: edgeConfigConfigured,
      settingsTab: 'integrations',
      hint: 'Link a Vercel Edge Config store for ultra-fast global reads.',
    },
    {
      id: 'github',
      name: 'GitHub integration',
      description: 'Install and update modules and themes directly from GitHub.',
      configured: githubConfigured,
      settingsTab: 'integrations',
      hint: 'Add a GitHub personal access token with repo read/write access.',
    },
    {
      id: 'sentry',
      name: 'Error monitoring',
      description: 'Track errors and exceptions in Sentry rather than just Vercel function logs.',
      configured: sentryConfigured,
      settingsTab: 'integrations',
      hint: 'Add your Sentry DSN.',
    },
  ]

  const configuredCount = features.filter((f) => f.configured).length
  const allConfigured = configuredCount === features.length

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <a
          href={`/${adminPath}/config?tab=status`}
          className={`badge badge-${config?.status === 'live' ? 'green' : config?.status === 'comingSoon' ? 'yellow' : 'red'}`}
          style={{ textDecoration: 'none' }}
        >
          Site Status: {config?.status === 'live' ? 'Live' : config?.status === 'comingSoon' ? 'Coming soon' : 'Maintenance'}
        </a>
      </div>

      <div className="card" style={{ marginBottom: '2rem' }}>
        <p style={{ margin: 0, color: 'var(--color-muted)', fontSize: '0.9375rem' }}>
          Logged in as <strong>{user?.username}</strong> ({user?.role.name})
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        {[
          { label: 'Pages', value: pageCount },
          { label: 'Users', value: userCount },
          { label: 'Media files', value: mediaCount },
        ].map((stat) => (
          <div key={stat.label} className="card" style={{ textAlign: 'center', padding: '1.25rem' }}>
            <div style={{ fontSize: '2rem', fontWeight: 700 }}>{stat.value}</div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {!allConfigured && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
            <h2 className="card-title" style={{ margin: 0 }}>Additional features</h2>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>{configuredCount} of {features.length} set up</span>
          </div>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: '0 0 1.25rem' }}>
            Your site is up and running. Set up these optional features whenever you&apos;re ready.
          </p>

          {/* Progress bar */}
          <div style={{ height: 4, background: 'var(--color-border)', borderRadius: 2, marginBottom: '1.5rem', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 2, background: 'var(--color-primary)',
              width: `${(configuredCount / features.length) * 100}%`,
              transition: 'width 0.3s ease',
            }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
            {features.map((f) => (
              <div key={f.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.875rem',
                padding: '0.875rem',
                borderRadius: 8,
                background: f.configured ? 'var(--color-success-subtle)' : 'var(--color-bg)',
                border: `1px solid ${f.configured ? 'var(--color-success-border)' : 'var(--color-border)'}`,
                marginBottom: '0.5rem',
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: f.configured ? 'var(--color-primary)' : 'var(--color-bg-subtle)',
                  fontSize: 'var(--text-sm)', fontWeight: 700,
                  color: f.configured ? 'var(--color-on-primary)' : 'var(--color-text-muted)',
                  marginTop: 1,
                }}>
                  {f.configured ? '✓' : '○'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 'var(--text-base)', color: f.configured ? 'var(--color-success)' : 'var(--color-text)' }}>
                      {f.name}
                    </span>
                    {!f.configured && (
                      <a
                        href={`/${adminPath}/config?tab=${f.settingsTab}`}
                        style={{ fontSize: 'var(--text-sm)', color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 500, whiteSpace: 'nowrap' }}
                      >
                        Set up →
                      </a>
                    )}
                  </div>
                  <p style={{ margin: '0.125rem 0 0', fontSize: '0.875rem', color: 'var(--color-muted)', lineHeight: 1.4 }}>
                    {f.configured ? f.description : f.hint}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {allConfigured && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <span style={{ fontSize: '1.125rem' }}>✓</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 'var(--text-base)', color: 'var(--color-success)' }}>All features configured</div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Your site is fully set up. You can manage all settings in <a href={`/${adminPath}/config`}>Settings</a>.</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
