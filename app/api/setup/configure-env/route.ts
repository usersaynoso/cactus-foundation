import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { isLocalMode } from '@/lib/config/env'
import { upsertVercelEnvVars } from '@/lib/vercel/env'

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

async function isSetupComplete(): Promise<boolean> {
  try {
    if (!process.env.DATABASE_URL) return false
    const config = await prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: { setupCompleted: true },
    })
    return config?.setupCompleted ?? false
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  if (await isSetupComplete()) {
    return NextResponse.json({ error: 'Setup is already complete' }, { status: 403 })
  }

  // This route writes env vars to a Vercel project. In local-development mode
  // there is no project: configuration lives in .env.local and is edited there.
  if (isLocalMode()) {
    return NextResponse.json(
      { error: 'Environment variables are managed via .env.local in local-development mode.' },
      { status: 400 }
    )
  }

  const token = process.env.VERCEL_API_TOKEN
  const projectId = process.env.VERCEL_PROJECT_ID
  if (!token || !projectId) {
    return NextResponse.json(
      { error: 'VERCEL_API_TOKEN and VERCEL_PROJECT_ID are required' },
      { status: 503 }
    )
  }

  let body: { vars?: Array<{ key: string; value: string }> }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!Array.isArray(body.vars)) {
    return NextResponse.json({ error: 'vars must be an array' }, { status: 400 })
  }

  // Trim each stored value: credentials pasted from a provider console often
  // carry a trailing space or newline, which S3 request signing later rejects
  // ("Malformed Access Key Id"). None of these keys legitimately carry
  // surrounding whitespace, so trimming on write is always safe.
  const toWrite = body.vars
    .filter(({ key, value }) => ALLOWED_KEYS.has(key) && typeof value === 'string' && value.trim() !== '')
    .map(({ key, value }) => ({ key, value: value.trim() }))

  if (toWrite.length === 0) {
    return NextResponse.json({ ok: true, written: 0 })
  }

  try {
    await upsertVercelEnvVars(token, projectId, toWrite)
    return NextResponse.json({ ok: true, written: toWrite.length })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: `Failed to write env vars: ${message}` }, { status: 502 })
  }
}
