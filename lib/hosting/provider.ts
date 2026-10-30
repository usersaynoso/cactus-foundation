// Which platform this site is hosted on, and the credential Cactus uses to drive it.
//
// Cactus runs on Vercel, on Netlify, or on a server the owner runs themselves. All
// three are driven the same way - an API token plus the id of the one project/site to
// act on - and every control-plane job (write an env var, start a rebuild, ask how a
// build is getting on) goes through lib/hosting/env.ts and lib/hosting/deploy.ts,
// which pick the right API from what is returned here. Nothing outside lib/hosting,
// lib/vercel, lib/netlify and lib/server-host should read VERCEL_API_TOKEN /
// NETLIFY_API_TOKEN / CACTUS_HOST_TOKEN directly.
//
// 'server' is a Linux box running the cactus-host companion (cactus-host/ in this
// repo), which builds the site, switches traffic between releases and keeps its env
// file. It is named for what the owner has, "their own server", rather than
// "self-hosted", which this codebase already uses for any `next start` including a
// developer's own machine.
//
// Detection is from the environment the platform itself injects:
//   - Vercel sets VERCEL=1 at build time AND at runtime.
//   - Netlify sets NETLIFY=true at build time, but its functions are not promised to
//     see it at runtime, so next.config.ts bakes the build-time answer into
//     CACTUS_HOSTING_PROVIDER. Both are checked so a script running in the Netlify
//     build (no Next inlining) still gets the right answer.
//   - A server sets nothing of its own, so cactus-host writes
//     CACTUS_HOSTING_PROVIDER=server into the site's env file, which both the build
//     and the running site read. next.config.ts passes it through unchanged.
// None present means local development: no control plane at all, config comes from
// .env.local.

export type HostingProvider = 'vercel' | 'netlify' | 'server'

export const HOSTING_PROVIDERS: readonly HostingProvider[] = ['vercel', 'netlify', 'server']

export const HOSTING_PROVIDER_LABELS: Record<HostingProvider, string> = {
  vercel: 'Vercel',
  netlify: 'Netlify',
  server: 'Your own server',
}

// The pair of env vars that hold each provider's credential. The token is the
// owner's personal access token (on a server, the per-site token cactus-host issued);
// the id names the one project (Vercel) or site (Netlify, server) Cactus writes to
// and rebuilds.
export const HOSTING_CREDENTIAL_KEYS: Record<HostingProvider, { token: string; siteId: string }> = {
  vercel: { token: 'VERCEL_API_TOKEN', siteId: 'VERCEL_PROJECT_ID' },
  netlify: { token: 'NETLIFY_API_TOKEN', siteId: 'NETLIFY_SITE_ID' },
  server: { token: 'CACTUS_HOST_TOKEN', siteId: 'CACTUS_HOST_SITE_ID' },
}

export type HostingCredentials = {
  provider: HostingProvider
  token: string
  siteId: string
}

export function isHostingProvider(value: unknown): value is HostingProvider {
  return value === 'vercel' || value === 'netlify' || value === 'server'
}

/** The platform this process is running on, or null in local development. */
export function detectHostingProvider(): HostingProvider | null {
  if (process.env.VERCEL === '1') return 'vercel'
  if (process.env.CACTUS_HOSTING_PROVIDER === 'server') return 'server'
  if (process.env.CACTUS_HOSTING_PROVIDER === 'netlify' || process.env.NETLIFY === 'true') {
    return 'netlify'
  }
  return null
}

function credentialsFromEnv(provider: HostingProvider): HostingCredentials | null {
  const keys = HOSTING_CREDENTIAL_KEYS[provider]
  const token = process.env[keys.token]?.trim()
  const siteId = process.env[keys.siteId]?.trim()
  return token && siteId ? { provider, token, siteId } : null
}

/**
 * The credential for the platform this site runs on, read from process.env.
 *
 * Off-platform (local development) there is no detected provider, so it falls back
 * to whichever pair happens to be set, in HOSTING_PROVIDERS order - Vercel first, the
 * same thing the code did when Vercel was the only option, so a .env.local carrying
 * Vercel credentials keeps behaving exactly as before.
 */
export function getHostingCredentials(): HostingCredentials | null {
  const detected = detectHostingProvider()
  if (detected) return credentialsFromEnv(detected)
  for (const provider of HOSTING_PROVIDERS) {
    const creds = credentialsFromEnv(provider)
    if (creds) return creds
  }
  return null
}

export function isHostingConfigured(): boolean {
  return getHostingCredentials() !== null
}

/**
 * Credentials for a setup-wizard request. Before the first redeploy the token and
 * site id the owner just pasted are not in process.env yet, so the wizard sends them
 * in the body; anything it leaves out comes from the environment.
 */
export function resolveHostingCredentials(override: {
  provider?: unknown
  token?: unknown
  siteId?: unknown
}): HostingCredentials | null {
  const provider = isHostingProvider(override.provider)
    ? override.provider
    : (detectHostingProvider() ?? getHostingCredentials()?.provider ?? null)
  if (!provider) return null
  const fromEnv = credentialsFromEnv(provider)
  const token = (typeof override.token === 'string' && override.token.trim()) || fromEnv?.token
  const siteId = (typeof override.siteId === 'string' && override.siteId.trim()) || fromEnv?.siteId
  return token && siteId ? { provider, token, siteId } : null
}

/** "VERCEL_API_TOKEN and VERCEL_PROJECT_ID are required", for whichever platform. */
export function missingCredentialsMessage(provider: HostingProvider | null = detectHostingProvider()): string {
  const keys = HOSTING_CREDENTIAL_KEYS[provider ?? 'vercel']
  return `${keys.token} and ${keys.siteId} are required`
}
