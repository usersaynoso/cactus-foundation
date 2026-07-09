import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { upsertVercelEnvVars } from '@/lib/vercel/env'

const VERCEL_API = 'https://api.vercel.com'

async function isSetupComplete(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false
  try {
    const { prisma } = await import('@/lib/db/prisma')
    const config = await prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: { setupCompleted: true },
    })
    return config?.setupCompleted ?? false
  } catch {
    return false
  }
}

// POST /api/setup/vercel-connect
//
// action: 'list-projects'  — validates the token and returns accessible projects
// action: 'add-domain'     — adds a custom domain to the selected project
// action: 'configure'      — writes bootstrap env vars to the selected project
//                            and triggers a redeploy
export async function POST(req: NextRequest) {
  if (await isSetupComplete()) {
    return NextResponse.json({ error: 'Setup is already complete' }, { status: 403 })
  }

  let body: {
    action?: string
    token?: string
    projectId?: string
    neonApiKey?: string
    domain?: string
  }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { action, token } = body
  if (!token) {
    return NextResponse.json({ error: 'token is required' }, { status: 400 })
  }

  // ── List projects ─────────────────────────────────────────────────────────
  if (action === 'list-projects') {
    const res = await fetch(`${VERCEL_API}/v9/projects?limit=100`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json(
        { error: `Vercel API error (${res.status}): ${text.slice(0, 200)}` },
        { status: 400 }
      )
    }

    const data = (await res.json()) as {
      projects: Array<{ id: string; name: string }>
    }

    // Fetch domains for each project in parallel
    const projects = await Promise.all(
      (data.projects ?? []).map(async (p) => {
        try {
          const domainsRes = await fetch(
            `${VERCEL_API}/v9/projects/${p.id}/domains?limit=50`,
            {
              headers: { Authorization: `Bearer ${token}` },
              signal: AbortSignal.timeout(8_000),
            }
          )
          const domainsData = (await domainsRes.json()) as {
            domains?: Array<{ name: string; verified?: boolean }>
          }
          return {
            id: p.id,
            name: p.name,
            domains: (domainsData.domains ?? []).map((d) => ({ name: d.name, verified: d.verified ?? true })),
          }
        } catch {
          return { id: p.id, name: p.name, domains: [] }
        }
      })
    )

    return NextResponse.json({ projects })
  }

  // ── Add a custom domain to a project ────────────────────────────────────────
  if (action === 'add-domain') {
    const { projectId, domain } = body
    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }
    if (!domain) {
      return NextResponse.json({ error: 'domain is required' }, { status: 400 })
    }

    const res = await fetch(`${VERCEL_API}/v10/projects/${projectId}/domains`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: domain }),
      signal: AbortSignal.timeout(10_000),
    })

    const data = (await res.json()) as {
      name?: string
      verified?: boolean
      verification?: Array<{ type: string; domain: string; value: string; reason: string }>
      error?: { message?: string }
    }

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error?.message ?? `Failed to add domain (${res.status})` },
        { status: 400 }
      )
    }

    return NextResponse.json({
      name: data.name ?? domain,
      verified: data.verified ?? false,
      verification: data.verification ?? [],
    })
  }

  // ── Configure project ─────────────────────────────────────────────────────
  if (action === 'configure') {
    const { projectId, neonApiKey, domain } = body
    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    // Fetch domains and project details in parallel
    const [domainsRes, projectRes] = await Promise.all([
      fetch(`${VERCEL_API}/v9/projects/${projectId}/domains?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      }),
      fetch(`${VERCEL_API}/v9/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      }),
    ])

    if (!domainsRes.ok) {
      return NextResponse.json(
        { error: `Failed to fetch project domains (${domainsRes.status})` },
        { status: 400 }
      )
    }

    const domainsData = (await domainsRes.json()) as {
      domains?: Array<{ name: string }>
    }
    const domains = domainsData.domains ?? []

    const projectData = projectRes.ok
      ? ((await projectRes.json()) as {
          link?: { org?: string; repo?: string; type?: string }
        })
      : null

    // If the caller picked a specific domain (existing or freshly added), use it
    // as long as it's actually attached to the project. Otherwise fall back to
    // auto-picking: prefer a custom (non-vercel.app) domain, else the vercel.app alias.
    let primaryDomain: string | undefined
    if (domain) {
      if (!domains.some((d) => d.name === domain)) {
        return NextResponse.json(
          { error: `Domain "${domain}" is not attached to this project.` },
          { status: 400 }
        )
      }
      primaryDomain = domain
    } else {
      const customDomain = domains.find((d) => !d.name.endsWith('.vercel.app'))
      const vercelDomain = domains.find((d) => d.name.endsWith('.vercel.app'))
      primaryDomain = customDomain?.name ?? vercelDomain?.name
    }

    if (!primaryDomain) {
      return NextResponse.json(
        { error: 'No domain found for this project. Please add a domain in the Vercel dashboard first.' },
        { status: 400 }
      )
    }

    const siteUrl = `https://${primaryDomain}`
    const sessionSecret = randomBytes(48).toString('hex')
    const encryptionKey = randomBytes(32).toString('hex')

    const vars: Array<{ key: string; value: string; type?: 'plain' | 'sensitive' }> = [
      { key: 'VERCEL_API_TOKEN', value: token, type: 'sensitive' },
      { key: 'VERCEL_PROJECT_ID', value: projectId, type: 'plain' },
      { key: 'SESSION_SECRET', value: sessionSecret, type: 'sensitive' },
      { key: 'ENCRYPTION_KEY', value: encryptionKey, type: 'sensitive' },
      { key: 'SITE_URL', value: siteUrl, type: 'plain' },
      { key: 'NEXT_PUBLIC_SITE_URL', value: siteUrl, type: 'plain' },
    ]

    if (neonApiKey) {
      vars.push({ key: 'NEON_API_KEY', value: neonApiKey.trim(), type: 'sensitive' })
    }

    const ghLink = projectData?.link
    if (ghLink?.type === 'github' && ghLink.org && ghLink.repo) {
      vars.push({ key: 'GITHUB_REPO', value: `${ghLink.org}/${ghLink.repo}`, type: 'plain' })
    }

    try {
      await upsertVercelEnvVars(token, projectId, vars)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return NextResponse.json(
        { error: `Failed to write environment variables: ${message}` },
        { status: 502 }
      )
    }

    // Do NOT redeploy here — we wait until DATABASE_URL is also configured so
    // the single combined redeploy picks up all bootstrap vars at once.
    return NextResponse.json({ status: 'configured', siteUrl })
  }

  return NextResponse.json({ error: `Unknown action: ${action ?? '(none)'}` }, { status: 400 })
}
