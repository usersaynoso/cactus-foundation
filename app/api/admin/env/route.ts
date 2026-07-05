import { NextRequest, NextResponse, after } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { isAdmin } from '@/lib/permissions/check'
import { getVercelEnvVarKeys, upsertVercelEnvVars, deleteVercelEnvVars } from '@/lib/vercel/env'
import { triggerVercelRedeploy } from '@/lib/vercel/deploy'
import { isLocalMode } from '@/lib/config/env'
import { errorResponse } from '@/lib/utils'
import { ALL_PROVIDERS, envKeysForProvider, ALL_CLOUDFLARE_CREDENTIAL_KEYS } from '@/lib/media/providers'
import { prisma } from '@/lib/db/prisma'
import { invalidateSiteConfigCache } from '@/lib/config/site'
import { recordDeploymentNeeded, labelForEnvKeys } from '@/lib/notifications/deployment'

// Give the function enough headroom for list + parallel deletes + redeploy.
export const maxDuration = 60

// The env vars that can be managed via the UI.
// Strictly protected infra vars that must never be deleted:
//   DATABASE_URL, SESSION_SECRET, SITE_URL, VERCEL_API_TOKEN, VERCEL_PROJECT_ID
const ALLOWED_KEYS = new Set([
  // Email
  'BREVO_API_KEY',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  // Media — all providers (derived from providers.ts so this stays in sync)
  ...ALL_PROVIDERS.flatMap(envKeysForProvider),
  // Media — Cloudflare credentials for auto-deploying the media Worker
  ...ALL_CLOUDFLARE_CREDENTIAL_KEYS,
  // Integrations
  'GITHUB_API_TOKEN',
  'ENCRYPTION_KEY',
  'NEON_API_KEY',
  'EDGE_CONFIG',
  'VERCEL_EDGE_CONFIG_ID',
  'VERCEL_WEBHOOK_SECRET',
  'TURNSTILE_SITE_KEY',
  'TURNSTILE_SECRET_KEY',
  'SENTRY_DSN',
  // Shop module — Stripe/PayPal (gates the two card/wallet payment methods at checkout)
  'STRIPE_SECRET_KEY',
  'STRIPE_PUBLISHABLE_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'PAYPAL_CLIENT_ID',
  'PAYPAL_CLIENT_SECRET',
  'PAYPAL_WEBHOOK_ID',
  'PAYPAL_MODE',
  // Setup-phase vars cleared on factory reset
  'NEON_PROJECT_ID',
  'NEXT_PUBLIC_SITE_URL',
])

// GET — returns which vars are currently set (boolean only, never values).
export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!isAdmin(user)) return errorResponse('Forbidden', 403)

  // Local-development mode: config lives in .env.local, not a Vercel project.
  // Report which managed vars are present in the running process (read-only) so
  // the UI can show status without ever calling the Vercel API.
  if (isLocalMode()) {
    const vars: Record<string, boolean> = {}
    for (const key of ALLOWED_KEYS) {
      vars[key] = !!process.env[key]
    }
    return NextResponse.json({ vars, localMode: true })
  }

  const token = process.env.VERCEL_API_TOKEN
  const projectId = process.env.VERCEL_PROJECT_ID
  if (!token || !projectId) {
    return errorResponse('VERCEL_API_TOKEN and VERCEL_PROJECT_ID are required', 503)
  }

  try {
    const keys = await getVercelEnvVarKeys(token, projectId)
    const keySet = new Set(keys)
    const vars: Record<string, boolean> = {}
    for (const key of ALLOWED_KEYS) {
      vars[key] = keySet.has(key)
    }
    return NextResponse.json({ vars })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return errorResponse(`Failed to fetch env var status: ${message}`, 502)
  }
}

// POST — writes supplied vars to Vercel project env vars.
// Body: { vars: Array<{ key: string; value: string }> }
// Empty/blank values are skipped.
export async function POST(req: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!isAdmin(user)) return errorResponse('Forbidden', 403)

  if (isLocalMode()) {
    return errorResponse('Environment variables are managed via .env.local in local-development mode. Edit the file and restart the dev server.', 503)
  }

  const token = process.env.VERCEL_API_TOKEN
  const projectId = process.env.VERCEL_PROJECT_ID
  if (!token || !projectId) {
    return errorResponse('VERCEL_API_TOKEN and VERCEL_PROJECT_ID are required', 503)
  }

  let body: { vars?: Array<{ key: string; value: string }> }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return errorResponse('Invalid JSON', 400)
  }

  if (!Array.isArray(body.vars)) {
    return errorResponse('vars must be an array', 400)
  }

  // Filter: only allowed keys with non-empty values.
  const toWrite = body.vars.filter(
    ({ key, value }) => ALLOWED_KEYS.has(key) && typeof value === 'string' && value.trim() !== ''
  )

  if (toWrite.length === 0) {
    return NextResponse.json({ ok: true, written: 0 })
  }

  try {
    await upsertVercelEnvVars(token, projectId, toWrite)
    await recordDeploymentNeeded({ label: labelForEnvKeys(toWrite.map((v) => v.key)) })
    return NextResponse.json({ ok: true, written: toWrite.length })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return errorResponse(`Failed to write env vars: ${message}`, 502)
  }
}

// DELETE — removes all managed env vars then triggers a redeploy (factory reset).
// The redeploy is scheduled via after() so it runs after the response is sent
// and never races against the function timeout.
export async function DELETE() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!isAdmin(user)) return errorResponse('Forbidden', 403)

  if (isLocalMode()) {
    return errorResponse('Environment variables are managed via .env.local in local-development mode. There is nothing to reset here.', 503)
  }

  const token = process.env.VERCEL_API_TOKEN
  const projectId = process.env.VERCEL_PROJECT_ID
  if (!token || !projectId) {
    return errorResponse('VERCEL_API_TOKEN and VERCEL_PROJECT_ID are required', 503)
  }

  let deleted: string[] = []
  let failed: Array<{ key: string; error: string }> = []

  try {
    const allKeys = await getVercelEnvVarKeys(token, projectId)
    const result = await deleteVercelEnvVars(token, projectId, allKeys)
    deleted = result.deleted
    failed = result.failed
    console.log(`[reset] deleted ${deleted.length} vars:`, deleted)
    if (failed.length > 0) {
      console.error(`[reset] ${failed.length} vars failed to delete:`, JSON.stringify(failed))
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[reset] deleteVercelEnvVars threw:', message)
    return errorResponse(`Failed to delete env vars: ${message}`, 502)
  }

  // Write a sentinel synchronously so the proxy shows the redeploying screen
  // the moment the client reloads — before the real deployment ID lands in after().
  try {
    await prisma.siteConfig.update({
      where: { id: 'singleton' },
      data: { pendingRedeployId: 'pending', pendingRedeployAt: new Date() },
    })
    invalidateSiteConfigCache()
  } catch (err) {
    console.error('[reset] Failed to write pendingRedeployId sentinel:', err)
  }

  // Trigger the redeploy after the response is sent so it never blocks or
  // races against the function timeout.
  after(async () => {
    const result = await triggerVercelRedeploy(token, projectId)
    if (result.triggered && result.deploymentId) {
      try {
        await prisma.siteConfig.updateMany({
          where: { id: 'singleton', pendingRedeployId: 'pending' },
          data: { pendingRedeployId: result.deploymentId },
        })
        invalidateSiteConfigCache()
      } catch (err) {
        console.error('[env] Failed to persist pendingRedeployId:', err)
      }
    } else {
      // Redeploy never started — clear the sentinel so we don't strand the user.
      try {
        await prisma.siteConfig.updateMany({
          where: { id: 'singleton', pendingRedeployId: 'pending' },
          data: { pendingRedeployId: null, pendingRedeployAt: null },
        })
        invalidateSiteConfigCache()
      } catch (err) {
        console.error('[env] Failed to clear pendingRedeployId sentinel:', err)
      }
    }
  })

  return NextResponse.json({
    ok: true,
    deleted: deleted.length,
    deletedKeys: deleted,
    failed,
    redeployTriggered: true,
  })
}
