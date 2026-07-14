import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { upsertVercelEnvVars } from '@/lib/vercel/env'

const VERCEL_API = 'https://api.vercel.com'

type Challenge = { type: string; domain: string; value: string; reason: string }
type DnsRecord = { type: string; host: string; value: string }

// The full picture for one domain. Two independent things can be outstanding:
//   misconfigured  — DNS isn't pointing at Vercel yet (A / CNAME / nameservers)
//   !verified      — Vercel hasn't accepted proof of ownership yet (TXT challenge)
// A domain can be pointed correctly and still be unverified (Vercel saw it
// registered under another account), so both must be reported and both gate setup.
type DomainState = {
  name: string
  verified: boolean
  verification: Challenge[]
  misconfigured: boolean
  recommended: DnsRecord
}

// Host label for a DNS record: '@' for the apex, otherwise everything left of the
// apex ('www', 'shop.eu', …). Splitting on the first dot breaks deep subdomains.
function recordHost(name: string, apexName?: string): string {
  if (!apexName || name === apexName) return '@'
  return name.endsWith(`.${apexName}`) ? name.slice(0, -(apexName.length + 1)) : name
}

function defaultRecord(name: string, apexName?: string): DnsRecord {
  const host = recordHost(name, apexName)
  return host === '@'
    ? { type: 'A', host: '@', value: '76.76.21.21' }
    : { type: 'CNAME', host, value: 'cname.vercel-dns.com' }
}

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

type ProjectDomain = {
  name?: string
  apexName?: string
  verified?: boolean
  verification?: Challenge[]
}

async function fetchProjectDomain(
  token: string,
  projectId: string,
  name: string
): Promise<ProjectDomain | null> {
  try {
    const res = await fetch(
      `${VERCEL_API}/v9/projects/${projectId}/domains/${encodeURIComponent(name)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      }
    )
    if (!res.ok) return null
    return (await res.json()) as ProjectDomain
  } catch {
    return null
  }
}

// Asks Vercel to re-check the ownership TXT record. Vercel does not flip a domain
// to verified on its own the moment the record lands — the dashboard's "Verify"
// button hits this endpoint, so the wizard has to as well or the user waits forever.
// Best-effort: a 4xx here just means the record isn't visible yet.
async function attemptVerify(token: string, projectId: string, name: string): Promise<void> {
  try {
    await fetch(
      `${VERCEL_API}/v9/projects/${projectId}/domains/${encodeURIComponent(name)}/verify`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(10_000),
      }
    )
  } catch {
    // Ignore — the follow-up read reports the real state.
  }
}

// The add-domain response's `verified` flag only tells you about ownership. Whether
// DNS actually points here comes from the domain config endpoint's `misconfigured`
// flag, which also gives Vercel's own recommended A/CNAME target rather than a guess.
async function fetchDomainConfig(
  token: string,
  name: string,
  apexName?: string
): Promise<{ misconfigured: boolean; recommended: DnsRecord }> {
  let misconfigured = true
  let recommended = defaultRecord(name, apexName)
  try {
    const res = await fetch(`${VERCEL_API}/v6/domains/${encodeURIComponent(name)}/config`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (res.ok) {
      const data = (await res.json()) as {
        misconfigured?: boolean
        recommendedIPv4?: Array<{ value: string[] }>
        recommendedCNAME?: Array<{ value: string }>
      }
      misconfigured = data.misconfigured ?? true
      const host = recordHost(name, apexName)
      if (host === '@' && data.recommendedIPv4?.[0]?.value?.[0]) {
        recommended = { type: 'A', host: '@', value: data.recommendedIPv4[0].value[0] }
      } else if (host !== '@' && data.recommendedCNAME?.[0]?.value) {
        recommended = {
          type: 'CNAME',
          host,
          value: data.recommendedCNAME[0].value.replace(/\.$/, ''),
        }
      }
    }
  } catch {
    // Best-effort — fall back to the default recommendation above.
  }
  return { misconfigured, recommended }
}

// Composite read: ownership state from the project-domain record, DNS state from the
// domain config endpoint. `.vercel.app` aliases are always live and never need either.
async function getDomainState(
  token: string,
  projectId: string,
  name: string,
  opts: { attemptVerify?: boolean } = {}
): Promise<DomainState | null> {
  if (name.endsWith('.vercel.app')) {
    return {
      name,
      verified: true,
      verification: [],
      misconfigured: false,
      recommended: defaultRecord(name),
    }
  }

  let domain = await fetchProjectDomain(token, projectId, name)
  if (!domain) return null

  if (opts.attemptVerify && domain.verified === false) {
    await attemptVerify(token, projectId, name)
    domain = (await fetchProjectDomain(token, projectId, name)) ?? domain
  }

  const { misconfigured, recommended } = await fetchDomainConfig(token, name, domain.apexName)

  return {
    name: domain.name ?? name,
    verified: domain.verified ?? false,
    verification: domain.verification ?? [],
    misconfigured,
    recommended,
  }
}

// POST /api/setup/vercel-connect
//
// action: 'list-projects'        — validates the token and returns accessible projects
// action: 'list-account-domains' — returns all domains in the account/team, not just this project
// action: 'add-domain'           — adds a custom domain to the selected project
// action: 'domain-status'        — re-checks ownership + DNS for a domain on the project
// action: 'configure'            — writes bootstrap env vars to the selected project
//                                   and triggers a redeploy
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

  // ── List all domains in the account/team ────────────────────────────────────
  if (action === 'list-account-domains') {
    const { projectId } = body
    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    // /v5/domains defaults to the personal-account scope. If the project lives under
    // a team, domains bought/added under that team are invisible unless teamId is
    // passed explicitly — so resolve the project's owning account first.
    const projectRes = await fetch(`${VERCEL_API}/v9/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    })
    const projectData = projectRes.ok
      ? ((await projectRes.json()) as { accountId?: string })
      : null
    const teamId = projectData?.accountId?.startsWith('team_') ? projectData.accountId : undefined
    const teamParam = teamId ? `&teamId=${encodeURIComponent(teamId)}` : ''

    const res = await fetch(`${VERCEL_API}/v5/domains?limit=100${teamParam}`, {
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
    const data = (await res.json()) as { domains?: Array<{ name: string; verified?: boolean }> }
    return NextResponse.json({
      domains: (data.domains ?? []).map((d) => ({ name: d.name, verified: d.verified ?? true })),
    })
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

    const data = (await res.json()) as ProjectDomain & { error?: { message?: string } }

    if (!res.ok) {
      // Vercel 409s when the domain is already attached to this project. That's not a
      // failure from the user's point of view — report the domain's real state instead
      // of a dead-end error, so any outstanding records still get shown. Confirm it is
      // genuinely attached first, or a rejected add would be dressed up as a success.
      const attached = await fetchProjectDomain(token, projectId, domain)
      if (attached) {
        const existing = await getDomainState(token, projectId, domain)
        if (existing) return NextResponse.json(existing)
      }

      return NextResponse.json(
        { error: data.error?.message ?? `Failed to add domain (${res.status})` },
        { status: 400 }
      )
    }

    const name = data.name ?? domain
    const { misconfigured, recommended } = await fetchDomainConfig(token, name, data.apexName)

    const state: DomainState = {
      name,
      verified: data.verified ?? false,
      verification: data.verification ?? [],
      misconfigured,
      recommended,
    }
    return NextResponse.json(state)
  }

  // ── Re-check ownership + DNS for a domain ───────────────────────────────────
  if (action === 'domain-status') {
    const { projectId, domain } = body
    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }
    if (!domain) {
      return NextResponse.json({ error: 'domain is required' }, { status: 400 })
    }

    const state = await getDomainState(token, projectId, domain, { attemptVerify: true })
    if (!state) {
      return NextResponse.json(
        { error: `Could not read the status of "${domain}" from Vercel.` },
        { status: 400 }
      )
    }
    return NextResponse.json(state)
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

    // The gate that actually matters. SITE_URL is written here, and SITE_URL is the
    // WebAuthn relying-party ID — it cannot be changed once the admin has registered a
    // passkey in the next step. So setup must not bake in a domain Vercel will not
    // serve. The wizard disables its own button for this, but that is only a courtesy.
    const state = await getDomainState(token, projectId, primaryDomain, { attemptVerify: true })
    if (!state) {
      return NextResponse.json(
        { error: `Could not confirm the status of "${primaryDomain}" with Vercel. Try again in a moment.` },
        { status: 400 }
      )
    }
    if (!state.verified || state.misconfigured) {
      const problems: string[] = []
      if (state.misconfigured) problems.push('its DNS is not pointing at Vercel yet')
      if (!state.verified) problems.push('Vercel has not verified that you own it')
      return NextResponse.json(
        {
          error: `Domain "${primaryDomain}" is not ready: ${problems.join(', and ')}. Add the DNS records the wizard listed, then try again.`,
        },
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
