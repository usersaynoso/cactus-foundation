// Env vars whose values are secrets. Each hosting platform stores these write-only
// (Vercel's `sensitive` type, Netlify's `is_secret` flag, cactus-host's secret
// marker) so the value cannot be read
// back out of its dashboard or API once saved; everything else is stored plain.
//
// Shared by every platform on purpose: a key that is secret on one is secret on the
// others, and separate lists would drift.
export const SENSITIVE_ENV_KEYS: ReadonlySet<string> = new Set([
  'DATABASE_URL',
  'SESSION_SECRET',
  'CRON_SECRET',
  'VERCEL_API_TOKEN',
  'NETLIFY_API_TOKEN',
  'CACTUS_HOST_TOKEN',
  'BREVO_API_KEY',
  'SMTP_PASS',
  'B2_APPLICATION_KEY',
  'GITHUB_API_TOKEN',
  'ENCRYPTION_KEY',
  'ENCRYPTION_KEY_NEXT',
  'NEON_API_KEY',
  'EDGE_CONFIG',
  'VERCEL_WEBHOOK_SECRET',
  'TURNSTILE_SECRET_KEY',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_GLOBAL_API_KEY',
  // Same kind of secret as CLOUDFLARE_API_TOKEN above, just scoped to cache
  // purging. Left plain it would be readable in the hosting dashboard while its
  // sibling was not, which is the sort of inconsistency nobody notices.
  'CLOUDFLARE_PURGE_API_TOKEN',
])

export function isSensitiveEnvKey(key: string): boolean {
  return SENSITIVE_ENV_KEYS.has(key)
}
