import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { getVercelEnvVarKeys, upsertVercelEnvVars, deleteVercelEnvVars } from '@/lib/vercel/env'
import { errorResponse } from '@/lib/utils'

// The env vars that can be managed via the UI.
// Required infrastructure vars (DATABASE_URL, SESSION_SECRET, SITE_URL,
// VERCEL_API_TOKEN, VERCEL_PROJECT_ID) are excluded — they're set at deploy time.
const ALLOWED_KEYS = new Set([
  'BREVO_API_KEY',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'B2_APPLICATION_KEY_ID',
  'B2_APPLICATION_KEY',
  'B2_BUCKET_NAME',
  'B2_ENDPOINT',
  'CLOUDFLARE_WORKER_URL',
  'GITHUB_API_TOKEN',
  'NEON_API_KEY',
  'EDGE_CONFIG',
  'VERCEL_EDGE_CONFIG_ID',
  'VERCEL_WEBHOOK_SECRET',
  'TURNSTILE_SITE_KEY',
  'TURNSTILE_SECRET_KEY',
  'SENTRY_DSN',
])

// GET — returns which vars are currently set (boolean only, never values).
export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)

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
    return NextResponse.json({ ok: true, written: toWrite.length })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return errorResponse(`Failed to write env vars: ${message}`, 502)
  }
}

// DELETE — removes all managed env vars (factory reset).
export async function DELETE() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)

  const token = process.env.VERCEL_API_TOKEN
  const projectId = process.env.VERCEL_PROJECT_ID
  if (!token || !projectId) {
    return errorResponse('VERCEL_API_TOKEN and VERCEL_PROJECT_ID are required', 503)
  }

  try {
    await deleteVercelEnvVars(token, projectId, [...ALLOWED_KEYS])
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return errorResponse(`Failed to delete env vars: ${message}`, 502)
  }
}
