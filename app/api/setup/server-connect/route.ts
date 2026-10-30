import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import type { SiteSummary } from '@/cactus-host/protocol'
import { upsertHostEnvVars, type HostEnvVar } from '@/lib/hosting/env'
import { resolveHostingCredentials } from '@/lib/hosting/provider'
import { getServerSite, listServerSites } from '@/lib/server-host/deploy'
import { addServerDomain, getServerDomain } from '@/lib/server-host/domains'

// The server twin of /api/setup/vercel-connect and /api/setup/netlify-connect. Same
// action names, the same `projectId` field (the cactus-host site name here) and the
// same DomainState shape back, so the setup wizard drives all three with one panel.
//
// The difference: on a server the credential is already in place. `cactus-host site
// add` wrote CACTUS_HOST_TOKEN and CACTUS_HOST_SITE_ID into the site's env file before
// its first build, so the wizard has nothing to paste and sends an empty token, which
// falls back to the environment. A token in the body is still honoured, for symmetry
// and for a site whose env predates the token.

type DnsRecord = { type: string; host: string; value: string }
type DomainState = {
  name: string
  verified: boolean
  verification: Array<{ type: string; domain: string; value: string; reason: string }>
  misconfigured: boolean
  recommended: DnsRecord
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

function error(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status })
}

// An A record at the server's address, proxied through Cloudflare. Without a zone to
// read, a two-label name is treated as the apex - wrong for example.co.uk, which is
// why the wizard's hint says so.
function recommendedRecord(name: string, site: SiteSummary): DnsRecord {
  const labels = name.split('.')
  const host = labels.length <= 2 ? '@' : labels.slice(0, -2).join('.')
  return { type: 'A', host, value: site.publicAddress ?? "your server's public IP address" }
}

// "Ownership" is not a separate question on a server: a domain whose requests reach
// this site on this box is, by construction, pointed here by whoever controls its DNS.
function toDomainState(name: string, serving: boolean, site: SiteSummary): DomainState {
  return { name, verified: true, verification: [], misconfigured: !serving, recommended: recommendedRecord(name, site) }
}

// POST /api/setup/server-connect
//
// action: 'list-projects'        - confirms cactus-host answers and returns this site
// action: 'list-account-domains' - always empty: a server has no domain account
// action: 'add-domain'           - adds a domain to the site's Caddy file
// action: 'domain-status'        - re-checks whether a domain reaches this site
// action: 'configure'            - writes bootstrap env vars to the site's env file
export async function POST(req: NextRequest) {
  if (await isSetupComplete()) {
    return error('Setup is already complete', 403)
  }

  let body: { action?: string; token?: string; projectId?: string; neonApiKey?: string; domain?: string }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return error('Invalid JSON body')
  }

  const creds = resolveHostingCredentials({
    provider: 'server',
    token: body.token,
    siteId: body.projectId,
  })
  if (!creds) {
    return error(
      'This site has no cactus-host token. On the server, run `cactus-host site refresh <site>` and build again, or paste the token from the site\'s env file.'
    )
  }
  const { action } = body

  if (action === 'list-projects') {
    let sites: SiteSummary[]
    try {
      sites = await listServerSites(creds.token)
    } catch (err: unknown) {
      return error(err instanceof Error ? err.message : 'Could not reach cactus-host on this server')
    }
    const projects = await Promise.all(
      sites.map(async (site) => ({
        id: site.id,
        name: site.name,
        domains: await Promise.all(
          site.domains.map(async (name) => ({
            name,
            verified: (await getServerDomain(creds.token, site.id, name).catch(() => null))?.serving ?? false,
          }))
        ),
      }))
    )
    return NextResponse.json({ projects })
  }

  const site = await getServerSite(creds.token, creds.siteId)
  if (!site) return error('cactus-host does not know that site, or the token is not for it.')

  if (action === 'list-account-domains') {
    return NextResponse.json({ domains: [] })
  }

  if (action === 'add-domain') {
    const domain = body.domain?.trim().toLowerCase()
    if (!domain) return error('domain is required')
    try {
      const state = await addServerDomain(creds.token, site.id, domain)
      return NextResponse.json(toDomainState(state.name, state.serving, site))
    } catch (err: unknown) {
      return error(err instanceof Error ? err.message : 'Could not add the domain')
    }
  }

  if (action === 'domain-status') {
    const domain = body.domain
    if (!domain) return error('domain is required')
    try {
      const state = await getServerDomain(creds.token, site.id, domain)
      return NextResponse.json(toDomainState(state.name, state.serving, site))
    } catch (err: unknown) {
      return error(err instanceof Error ? err.message : 'Could not check the domain')
    }
  }

  if (action === 'configure') {
    const primaryDomain = body.domain ?? site.domains[0]
    if (!primaryDomain) return error('Add a domain for this site first.')
    if (!site.domains.includes(primaryDomain)) {
      return error(`Domain "${primaryDomain}" is not attached to this site.`)
    }

    // SITE_URL becomes the WebAuthn relying-party ID and cannot be changed once the
    // admin registers a passkey in the next step, so a domain that does not reach this
    // site yet must not be baked in. The wizard disables its own button for this;
    // this is the check that counts.
    const state = await getServerDomain(creds.token, site.id, primaryDomain).catch(() => null)
    if (!state?.serving) {
      return error(
        `Domain "${primaryDomain}" is not reaching this server yet. Point it at the server (proxied through Cloudflare), wait for DNS to catch up, then try again.`
      )
    }

    const siteUrl = `https://${primaryDomain}`
    const vars: HostEnvVar[] = [
      { key: 'SESSION_SECRET', value: randomBytes(48).toString('hex'), secret: true },
      { key: 'ENCRYPTION_KEY', value: randomBytes(32).toString('hex'), secret: true },
      // cactus-host sends this as a bearer token on every dispatcher tick and every
      // cron route checks it, so it is minted with the other internal secrets and the
      // site's scheduled jobs work from its first build.
      { key: 'CRON_SECRET', value: randomBytes(32).toString('hex'), secret: true },
      { key: 'SITE_URL', value: siteUrl, secret: false },
      { key: 'NEXT_PUBLIC_SITE_URL', value: siteUrl, secret: false },
      { key: 'GITHUB_REPO', value: site.repo, secret: false },
    ]
    if (body.neonApiKey) {
      vars.push({ key: 'NEON_API_KEY', value: body.neonApiKey.trim(), secret: true })
    }

    try {
      await upsertHostEnvVars(creds, vars)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return error(`Failed to write environment variables: ${message}`, 502)
    }

    // No build yet: the wizard waits until DATABASE_URL is also saved so one build
    // picks up every bootstrap var at once.
    return NextResponse.json({ status: 'configured', siteUrl })
  }

  return error(`Unknown action: ${action ?? '(none)'}`)
}
