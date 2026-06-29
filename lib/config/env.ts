import type { MediaProviderType } from '@prisma/client'
import {
  PROVIDER_ENV_VARS,
  PROVIDER_LABELS,
  envKeysForProvider,
  isProxied,
} from '@/lib/media/providers'

export type EnvVarStatus = {
  name: string
  description: string
  required: boolean
  set: boolean
  gates?: string
}

// All environment variables the application reads, grouped by category.
// This is the single source of truth for the setup env-check step and the
// admin dashboard banner.
export function getEnvStatus(): {
  required: EnvVarStatus[]
  optional: EnvVarStatus[]
} {
  const required: EnvVarStatus[] = [
    {
      name: 'DATABASE_URL',
      description: 'PostgreSQL pooled connection string. Can be provisioned automatically during setup.',
      required: true,
      set: !!process.env.DATABASE_URL,
    },
    {
      name: 'VERCEL_API_TOKEN',
      description:
        'Vercel REST API token. Entered during setup — used for writing env vars, triggering redeployments, and provisioning databases.',
      required: true,
      set: !!process.env.VERCEL_API_TOKEN,
    },
    {
      name: 'VERCEL_PROJECT_ID',
      description:
        'Vercel project ID. Selected during setup — identifies which project to configure.',
      required: true,
      set: !!process.env.VERCEL_PROJECT_ID,
    },
  ]

  const optional: EnvVarStatus[] = [
    {
      name: 'SESSION_SECRET',
      description: 'Secret for signing session tokens (min 32 characters). Auto-generated during setup.',
      required: false,
      set: !!process.env.SESSION_SECRET,
    },
    {
      name: 'SITE_URL',
      description:
        'Canonical public domain — also used as the WebAuthn relying party ID. Auto-detected from your Vercel project during setup.',
      required: false,
      set: !!process.env.SITE_URL,
    },
    {
      name: 'BREVO_API_KEY',
      description: 'Brevo transactional email API key',
      required: false,
      set: !!process.env.BREVO_API_KEY,
      gates: 'Password login, email verification, account recovery emails',
    },
    {
      name: 'SMTP_HOST',
      description: 'SMTP host (alternative to Brevo)',
      required: false,
      set: !!process.env.SMTP_HOST,
      gates: 'Password login, email verification, account recovery emails',
    },
    {
      name: 'SMTP_PORT',
      description: 'SMTP port (e.g. 587 for TLS, 465 for SSL)',
      required: false,
      set: !!process.env.SMTP_PORT,
      gates: 'SMTP email sending',
    },
    {
      name: 'SMTP_USER',
      description: 'SMTP username / login',
      required: false,
      set: !!process.env.SMTP_USER,
      gates: 'SMTP email sending',
    },
    {
      name: 'SMTP_PASS',
      description: 'SMTP password or app-specific password',
      required: false,
      set: !!process.env.SMTP_PASS,
      gates: 'SMTP email sending',
    },
    // Media provider credentials. One provider is active at a time (chosen in
    // Settings → Media); all ten providers' vars are optional. See
    // lib/media/providers.ts for the per-provider var sets.
    {
      name: 'CLOUDFLARE_WORKER_URL',
      description: 'Shared URL of the Cloudflare Worker that proxies object-storage providers (B2, R2, S3, Spaces, Wasabi, MinIO, Vercel Blob, Supabase)',
      required: false,
      set: !!process.env.CLOUDFLARE_WORKER_URL,
      gates: 'Media serving via Cloudflare Worker (proxied providers)',
    },
    ...MEDIA_PROVIDER_ENV_STATUS(),
    {
      name: 'GITHUB_API_TOKEN',
      description: 'GitHub personal access token (repo-read + repo-write scopes). Alternative: connect a GitHub App via Config → Integrations.',
      required: false,
      set: !!process.env.GITHUB_API_TOKEN,
      gates: 'Module and theme install/update (fallback when no GitHub App is connected)',
    },
    {
      name: 'ENCRYPTION_KEY',
      description: '64-character hex string (32 bytes) for encrypting GitHub App credentials in the database. Generate: openssl rand -hex 32',
      required: false,
      set: !!process.env.ENCRYPTION_KEY,
      gates: 'GitHub App connection flow (alternative to GITHUB_API_TOKEN)',
    },
    {
      name: 'NEON_API_KEY',
      description:
        'Neon API key. Lets Cactus create a Postgres database for you automatically during setup. Leave unset if you are supplying your own DATABASE_URL. Generate from: Neon console → Account Settings → API keys.',
      required: false,
      set: !!process.env.NEON_API_KEY,
      gates: 'Automatic database provisioning during setup',
    },
    {
      name: 'EDGE_CONFIG',
      description: 'Vercel Edge Config read connection string',
      required: false,
      set: !!process.env.EDGE_CONFIG,
      gates: 'Fast Edge Config reads for admin path and site status',
    },
    {
      name: 'VERCEL_EDGE_CONFIG_ID',
      description: "The Edge Config's own ID (for writes via Vercel REST API)",
      required: false,
      set: !!process.env.VERCEL_EDGE_CONFIG_ID,
      gates: 'Updating admin path and site status in Edge Config',
    },
    {
      name: 'VERCEL_WEBHOOK_SECRET',
      description: 'Secret for verifying Vercel deployment webhook payloads',
      required: false,
      set: !!process.env.VERCEL_WEBHOOK_SECRET,
      gates:
        'Automatic deployment status updates (Pro/Enterprise only; falls back to lazy polling)',
    },
    {
      name: 'TURNSTILE_SITE_KEY',
      description: 'Cloudflare Turnstile site key',
      required: false,
      set: !!process.env.TURNSTILE_SITE_KEY,
      gates: 'Bot protection on public forms',
    },
    {
      name: 'TURNSTILE_SECRET_KEY',
      description: 'Cloudflare Turnstile secret key',
      required: false,
      set: !!process.env.TURNSTILE_SECRET_KEY,
      gates: 'Bot protection on public forms',
    },
    {
      name: 'SENTRY_DSN',
      description: 'Sentry DSN for error reporting',
      required: false,
      set: !!process.env.SENTRY_DSN,
      gates: 'Error reporting via Sentry (errors log to Vercel functions if unset)',
    },
  ]

  return { required, optional }
}

export function requiredEnvMissing(): string[] {
  const { required } = getEnvStatus()
  return required.filter((v) => !v.set).map((v) => v.name)
}

export function isEmailConfigured(): boolean {
  return !!(process.env.BREVO_API_KEY || process.env.SMTP_HOST)
}

// Per-provider env var statuses, flattened for the optional env list. Each var is
// labelled with which provider it belongs to and that provider gates media uploads.
function MEDIA_PROVIDER_ENV_STATUS(): EnvVarStatus[] {
  const out: EnvVarStatus[] = []
  for (const provider of Object.keys(PROVIDER_ENV_VARS) as MediaProviderType[]) {
    for (const v of PROVIDER_ENV_VARS[provider]) {
      out.push({
        name: v.key,
        description: `${PROVIDER_LABELS[provider]} — media storage`,
        required: false,
        set: !!process.env[v.key],
        gates: `Media uploads when ${PROVIDER_LABELS[provider]} is the active provider`,
      })
    }
  }
  return out
}

// True when every env var the given provider needs is present. For proxied
// providers this includes CLOUDFLARE_WORKER_URL.
export function isMediaProviderConfigured(provider: MediaProviderType): boolean {
  return envKeysForProvider(provider).every((k) => !!process.env[k])
}

// Resolves the active media provider from SiteConfig. Imported lazily to keep
// this module free of a hard Prisma dependency at import time.
export async function getActiveMediaProvider(): Promise<MediaProviderType | null> {
  const { prisma } = await import('@/lib/db/prisma')
  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { mediaProvider: true },
  })
  return config?.mediaProvider ?? null
}

// True when a provider is selected AND fully configured. Used to gate uploads.
export async function isMediaConfigured(): Promise<boolean> {
  const provider = await getActiveMediaProvider()
  return !!provider && isMediaProviderConfigured(provider)
}

// Worker-relevant: which proxied providers currently have credentials present.
// The Worker must hold secrets for any proxied provider that still has rows.
export function configuredProxiedProviders(): MediaProviderType[] {
  return (Object.keys(PROVIDER_ENV_VARS) as MediaProviderType[]).filter(
    (p) => isProxied(p) && isMediaProviderConfigured(p)
  )
}

export async function isGitHubConfigured(): Promise<boolean> {
  if (process.env.GITHUB_API_TOKEN) return true
  if (!process.env.ENCRYPTION_KEY) return false
  const { prisma } = await import('@/lib/db/prisma')
  const conn = await prisma.githubAppConnection.findFirst({ select: { installationId: true } })
  return !!conn?.installationId
}

export type GitHubConfigStatus = 'configured' | 'app_not_installed' | 'not_configured'

export async function getGitHubConfigStatus(): Promise<GitHubConfigStatus> {
  if (process.env.GITHUB_API_TOKEN) return 'configured'
  if (!process.env.ENCRYPTION_KEY) return 'not_configured'
  const { prisma } = await import('@/lib/db/prisma')
  const conn = await prisma.githubAppConnection.findFirst({ select: { installationId: true } })
  if (!conn) return 'not_configured'
  if (!conn.installationId) return 'app_not_installed'
  return 'configured'
}

export function isVercelConfigured(): boolean {
  return !!(process.env.VERCEL_API_TOKEN && process.env.VERCEL_PROJECT_ID)
}

export function isNeonConfigured(): boolean {
  return !!process.env.NEON_API_KEY
}

export function isEdgeConfigWritable(): boolean {
  return !!(
    process.env.VERCEL_API_TOKEN && process.env.VERCEL_EDGE_CONFIG_ID
  )
}

export function isTurnstileConfigured(): boolean {
  return !!(process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY)
}

export function getSiteUrl(): string {
  const url =
    process.env.SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
  if (!url) throw new Error('SITE_URL environment variable is not set')
  return url.replace(/\/$/, '')
}

export function getSiteUrlOrNull(): string | null {
  try {
    return getSiteUrl()
  } catch {
    return null
  }
}

export function getWebAuthnRpId(): string {
  if (process.env.NODE_ENV === 'development') {
    return 'localhost'
  }
  // Must use SITE_URL only — VERCEL_URL changes per deployment and would break
  // passkey authentication after the first deployment.
  const siteUrl = process.env.SITE_URL
  if (!siteUrl) throw new Error('SITE_URL is required for WebAuthn')
  try {
    return new URL(siteUrl).hostname
  } catch {
    throw new Error(`SITE_URL is not a valid URL: ${siteUrl}`)
  }
}

export function getWebAuthnOrigin(): string {
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:3000'
  }
  const siteUrl = process.env.SITE_URL
  if (!siteUrl) throw new Error('SITE_URL is required for WebAuthn')
  return siteUrl.replace(/\/$/, '')
}

export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET environment variable is not set')
  if (secret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters')
  }
  return secret
}
