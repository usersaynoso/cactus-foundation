import type { MediaProviderType } from '@prisma/client'
import {
  CLOUDFLARE_WORKER_VAR,
  PROVIDER_ENV_VARS,
  PROVIDER_LABELS,
  envKeysForProvider,
  isProxied,
} from '@/lib/media/providers'
import {
  detectHostingProvider,
  getHostingCredentials,
  HOSTING_CREDENTIAL_KEYS,
  HOSTING_PROVIDER_LABELS,
  type HostingProvider,
} from '@/lib/hosting/provider'

export type EnvVarStatus = {
  name: string
  description: string
  required: boolean
  set: boolean
  gates?: string
}

// True when the app is running on neither Vercel nor Netlify. Each platform marks
// its own builds and runtime (see lib/hosting/provider.ts); neither is ever set
// locally. Their absence is the signal for "local-development mode", where the
// hosting control plane (env-var writes, redeploys, core/module updates) is
// unavailable and config comes from .env.local. A real deployment that simply
// hasn't connected its API token yet is still detected, so it is never
// misclassified as local.
export function isLocalMode(): boolean {
  return detectHostingProvider() === null
}

// All environment variables the application reads, grouped by category.
// This is the single source of truth for the setup env-check step and the
// admin dashboard banner.
export function getEnvStatus(): {
  required: EnvVarStatus[]
  optional: EnvVarStatus[]
} {
  // Local-development mode flips which vars are mandatory: locally the user must
  // supply DATABASE_URL, SESSION_SECRET and SITE_URL in .env.local, and the Vercel
  // control-plane vars become optional (they're unused). On Vercel the reverse holds.
  const local = isLocalMode()

  const databaseUrl: EnvVarStatus = {
    name: 'DATABASE_URL',
    description: 'PostgreSQL pooled connection string. Can be provisioned automatically during setup.',
    required: true,
    set: !!process.env.DATABASE_URL,
  }
  // The credential pair for the platform this site runs on. Locally (no platform
  // detected) both pairs are listed as optional, since neither is used.
  const host: HostingProvider | null = detectHostingProvider()
  const hostingVars = (provider: HostingProvider): EnvVarStatus[] => {
    const label = HOSTING_PROVIDER_LABELS[provider]
    const keys = HOSTING_CREDENTIAL_KEYS[provider]
    const required = !local && host === provider
    return [
      {
        name: keys.token,
        description: `${label} REST API token. Entered during setup - used for writing env vars, triggering redeployments, and provisioning databases. Not used in local-development mode.`,
        required,
        set: !!process.env[keys.token],
      },
      {
        name: keys.siteId,
        description: `${label} ${provider === 'netlify' ? 'site' : 'project'} ID. Selected during setup - identifies which ${provider === 'netlify' ? 'site' : 'project'} to configure. Not used in local-development mode.`,
        required,
        set: !!process.env[keys.siteId],
      },
    ]
  }
  const hostingRequired = host ? hostingVars(host) : []
  const hostingOptional = host ? [] : [...hostingVars('vercel'), ...hostingVars('netlify')]
  const sessionSecret: EnvVarStatus = {
    name: 'SESSION_SECRET',
    description: local
      ? 'Secret for signing session tokens (min 32 characters). Set it in .env.local: openssl rand -base64 32'
      : 'Secret for signing session tokens (min 32 characters). Auto-generated during setup.',
    required: local,
    set: !!process.env.SESSION_SECRET,
  }
  const siteUrl: EnvVarStatus = {
    name: 'SITE_URL',
    description: local
      ? 'Canonical public URL - also the WebAuthn relying party ID. Set it to http://localhost:3000 in .env.local.'
      : 'Canonical public domain - also used as the WebAuthn relying party ID. Auto-detected from your hosting project during setup.',
    required: local,
    set: !!process.env.SITE_URL,
  }

  const required: EnvVarStatus[] = local
    ? [databaseUrl, sessionSecret, siteUrl]
    : [databaseUrl, ...hostingRequired]

  const optional: EnvVarStatus[] = [
    ...(local ? hostingOptional : [sessionSecret, siteUrl]),
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
    {
      name: 'MEDIA_SERVING_MODE',
      description: 'How S3-compatible media is served: "worker" (default) or "direct" (straight from the bucket, no Cloudflare Worker)',
      required: false,
      set: !!process.env.MEDIA_SERVING_MODE,
      gates: 'Whether CLOUDFLARE_WORKER_URL is required for B2, R2, S3, Spaces, Wasabi and MinIO',
    },
    {
      name: 'MEDIA_DIRECT_RESIZE',
      description: 'Picture resizing when media is served directly: "off" (default, originals) or "platform" (the hosting platform\u2019s image optimisation)',
      required: false,
      set: !!process.env.MEDIA_DIRECT_RESIZE,
      gates: 'Image resizing in direct serving mode',
    },
    // Page cache (Settings → Speed). Both optional and both only used
    // when the site sits behind Cloudflare: without them the cache still works,
    // an edited page just waits out its window instead of being cleared at once.
    {
      name: 'CLOUDFLARE_ZONE_ID',
      description: 'Cloudflare zone id for this site\u2019s domain. Enables clearing cached pages the moment they are edited.',
      required: false,
      set: !!process.env.CLOUDFLARE_ZONE_ID,
      gates: 'Instant clearing of cached pages after an edit',
    },
    {
      name: 'CLOUDFLARE_PURGE_API_TOKEN',
      description: 'Cloudflare API token with Zone \u2192 Cache Purge permission. Falls back to CLOUDFLARE_API_TOKEN, which only works if that token also carries the purge permission.',
      required: false,
      set: !!(process.env.CLOUDFLARE_PURGE_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN),
      gates: 'Instant clearing of cached pages after an edit',
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
      name: 'MODULE_CLONE_TOKEN',
      description:
        'GitHub token used only at deploy time to fetch private module repositories (a fine-grained PAT with read-only Contents access on those repos). Optional - without it, deploys fall back to the GitHub App connection, then GITHUB_API_TOKEN.',
      required: false,
      set: !!process.env.MODULE_CLONE_TOKEN,
      gates: 'Deploy-time fetch of private custom modules',
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
      name: 'CRON_SECRET',
      description:
        'Bearer token attached to every scheduled request (by Vercel itself, or by the Netlify scheduled function). Created automatically during setup, and again on the next update if this site predates that. Nothing to fetch from anywhere - it only ever means something to this site.',
      required: false,
      set: !!process.env.CRON_SECRET,
      gates: 'Every scheduled job, core and module (they answer 503 without it)',
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
      gates: 'Error reporting via Sentry (errors log to the hosting platform\u2019s function logs if unset)',
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
// providers this includes CLOUDFLARE_WORKER_URL, unless the owner has chosen to
// serve the provider straight from its bucket (see lib/media/serving-mode.ts).
export function isMediaProviderConfigured(provider: MediaProviderType): boolean {
  return missingMediaEnvKeys(provider).length === 0
}

// The env vars `provider` still needs, in the order the settings page lists them.
export function missingMediaEnvKeys(provider: MediaProviderType): string[] {
  return envKeysForProvider(provider).filter((k) => !process.env[k])
}

// What to tell someone whose upload was refused because storage is not ready -
// naming the actual gap rather than asking for credentials that may well all be
// present. The usual surprise is the Worker: every S3-style provider needs it
// unless the owner has switched to serving straight from the bucket, and an
// owner who has typed in four correct keys cannot be expected to guess that.
export function mediaNotConfiguredMessage(provider: MediaProviderType | null): string {
  if (!provider) return 'Media storage is not configured. Choose a storage provider in Settings → Media.'
  const missing = missingMediaEnvKeys(provider)
  const label = PROVIDER_LABELS[provider]
  const credentials = missing.filter((k) => k !== CLOUDFLARE_WORKER_VAR.key)
  if (credentials.length > 0) {
    return `Media storage is not configured: ${label} still needs ${credentials.join(', ')}. Add ${credentials.length === 1 ? 'it' : 'them'} in Settings → Media, then redeploy.`
  }
  if (missing.includes(CLOUDFLARE_WORKER_VAR.key)) {
    return `Media storage is not configured: ${label} is set up, but the media Worker is not (${CLOUDFLARE_WORKER_VAR.key} is missing). Deploy the media Worker from Settings → Media, or choose "Serve directly from the bucket" there.`
  }
  return 'Media storage is not configured. Select a provider and add its credentials in Settings → Media.'
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

export function isHostingConfigured(): boolean {
  return getHostingCredentials() !== null
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
  // VERCEL_URL is per-deployment on Vercel; URL is the site's main address on
  // Netlify. Both are fallbacks for the window before setup has written SITE_URL.
  const url =
    process.env.SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    (detectHostingProvider() === 'netlify' && process.env.URL ? process.env.URL : null)
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
  // Must use SITE_URL only — VERCEL_URL (and Netlify's deploy URLs) change per deployment and would break
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

// The media worker (services/video-worker) re-encodes a video into the one
// delivery format the platform serves everywhere. It runs off-platform (a CPU
// box, typically a scale-to-zero Fly machine), so the app reaches it over HTTPS
// with a shared bearer secret. Both are optional: unset simply means the
// "Optimise video" action is unavailable, the same way an unconfigured media
// provider disables uploads rather than breaking the page.
//
// The SEQUENCE_* names are the ones this started life under, when the same
// service only built scroll sequences. They are still read, so an install that
// predates the rename keeps working without anyone touching its environment.
function readEnv(...names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name]?.trim()
    if (value) return value
  }
  return null
}

export function getMediaWorkerUrl(): string | null {
  return readEnv('MEDIA_WORKER_URL', 'SEQUENCE_WORKER_URL')?.replace(/\/+$/, '') || null
}

export function getMediaWorkerSecret(): string | null {
  return readEnv('MEDIA_WORKER_SECRET', 'SEQUENCE_WORKER_SECRET')
}

export function isMediaWorkerConfigured(): boolean {
  return !!getMediaWorkerUrl() && !!getMediaWorkerSecret()
}

// Optional Fly.io API token for the media worker. When present (or when a token
// is saved under Media > Video, which wins), each job runs on its own
// short-lived Fly machine instead of queueing on the single worker - see
// lib/media/fly-machines.ts. Unset simply means the shared-worker behaviour.
export function getMediaWorkerFlyTokenEnv(): string | null {
  return readEnv('MEDIA_WORKER_FLY_TOKEN', 'SEQUENCE_FLY_TOKEN')
}

// Optional ceiling on how many jobs may run at once in per-job machine mode.
// Unset (or 0) means no ceiling: every job gets its own machine, however many
// are already going - which is the point of per-job machines, since a machine
// only exists while its own job runs. Set a positive number only to put a lid
// on spend; a job asked for past the lid is refused with a plain message rather
// than queued, because a queued job has no machine of its own to be polled on.
export function getMediaWorkerMaxJobMachines(): number {
  const raw = Number(readEnv('MEDIA_WORKER_MAX_JOB_MACHINES', 'SEQUENCE_MAX_JOB_MACHINES') ?? '')
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0
}
