import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { upsertHostEnvVars, type HostEnvVar } from '@/lib/hosting/env'
import {
  assertNetlifyOk,
  getNetlifyCertifiedDomains,
  getNetlifySite,
  listNetlifySites,
  netlifyFetch,
  netlifyGithubRepo,
  netlifySiteDomains,
  type NetlifySite,
} from '@/lib/netlify/api'

// The Netlify twin of /api/setup/vercel-connect. It speaks the same protocol - the
// same action names, the same `projectId` field (a Netlify site id here) and the same
// DomainState shape back - so the setup wizard drives either platform with one panel.

type DnsRecord = { type: string; host: string; value: string }
type DomainState = {
  name: string
  verified: boolean
  verification: Array<{ type: string; domain: string; value: string; reason: string }>
  misconfigured: boolean
  recommended: DnsRecord
}

// Netlify's documented load-balancer address for an apex domain that is not on
// Netlify DNS. Subdomains CNAME to the site's own netlify.app hostname instead.
const NETLIFY_APEX_IP = '75.2.60.5'

function isPlatformDomain(name: string): boolean {
  return name.endsWith('.netlify.app')
}

// Host label for a DNS record. Without Netlify DNS there is no zone to read the apex
// from, so a two-label name is treated as the apex and anything longer as a subdomain
// of its last two labels. Wrong for the likes of example.co.uk's apex, which is why
// the wizard also links to Netlify's own domain page for the authoritative answer.
function recommendedRecord(name: string, site: NetlifySite): DnsRecord {
  const labels = name.split('.')
  if (labels.length <= 2) return { type: 'A', host: '@', value: NETLIFY_APEX_IP }
  return { type: 'CNAME', host: labels.slice(0, -2).join('.'), value: `${site.name}.netlify.app` }
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

// A Netlify domain is ready once Netlify holds a live certificate for it, which it
// only issues after DNS points at the site. Netlify has no separate ownership
// challenge for the common case, so `verified` follows readiness and the wizard's
// "needs proof that it is yours" branch never shows for this platform.
async function getDomainState(token: string, site: NetlifySite, name: string): Promise<DomainState> {
  const ready = isPlatformDomain(name) || (await getNetlifyCertifiedDomains(token, site.id)).includes(name)
  return {
    name,
    verified: true,
    verification: [],
    misconfigured: !ready,
    recommended: recommendedRecord(name, site),
  }
}

function error(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status })
}

// POST /api/setup/netlify-connect
//
// action: 'list-projects'        — validates the token and returns the sites it can see
// action: 'list-account-domains' — returns the domains on the team's Netlify DNS
// action: 'add-domain'           — attaches a domain to the selected site
// action: 'domain-status'        — re-checks whether a domain is serving the site
// action: 'configure'            — writes bootstrap env vars to the selected site
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

  const { action, token } = body
  if (!token) return error('token is required')

  // ── List sites ────────────────────────────────────────────────────────────
  if (action === 'list-projects') {
    let sites: NetlifySite[]
    try {
      sites = await listNetlifySites(token)
    } catch (err: unknown) {
      return error(err instanceof Error ? err.message : 'Could not reach Netlify')
    }
    const projects = await Promise.all(
      sites.map(async (site) => {
        const certified = new Set(await getNetlifyCertifiedDomains(token, site.id))
        return {
          id: site.id,
          name: site.name,
          domains: netlifySiteDomains(site).map((name) => ({
            name,
            verified: isPlatformDomain(name) || certified.has(name),
          })),
        }
      })
    )
    return NextResponse.json({ projects })
  }

  const siteId = body.projectId
  if (!siteId) return error('projectId is required')
  const site = await getNetlifySite(token, siteId)
  if (!site) return error('That Netlify site was not found, or the token cannot see it.')

  // ── Domains on the team's Netlify DNS ─────────────────────────────────────
  if (action === 'list-account-domains') {
    try {
      const res = await netlifyFetch(token, '/dns_zones', { timeoutMs: 10_000 })
      await assertNetlifyOk(res, 'list DNS zones')
      const zones = (await res.json()) as Array<{ name?: string; account_id?: string }>
      const domains = zones
        .filter((z) => !!z.name && (!site.account_id || !z.account_id || z.account_id === site.account_id))
        .map((z) => ({ name: z.name as string, verified: true }))
      return NextResponse.json({ domains })
    } catch (err: unknown) {
      return error(err instanceof Error ? err.message : 'Could not list domains')
    }
  }

  // ── Attach a domain to the site ───────────────────────────────────────────
  // The first custom domain becomes the site's primary domain; any after that are
  // added as aliases, which serve the same site.
  if (action === 'add-domain') {
    const domain = body.domain?.trim().toLowerCase()
    if (!domain) return error('domain is required')

    if (!netlifySiteDomains(site).includes(domain)) {
      const patch = site.custom_domain
        ? { domain_aliases: [...(site.domain_aliases ?? []), domain] }
        : { custom_domain: domain }
      const res = await netlifyFetch(token, `/sites/${encodeURIComponent(site.id)}`, {
        method: 'PATCH',
        body: patch,
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        return error(`Netlify would not add "${domain}" (${res.status}): ${text.slice(0, 200)}`)
      }
    }
    return NextResponse.json(await getDomainState(token, site, domain))
  }

  // ── Re-check a domain ─────────────────────────────────────────────────────
  if (action === 'domain-status') {
    const domain = body.domain
    if (!domain) return error('domain is required')
    return NextResponse.json(await getDomainState(token, site, domain))
  }

  // ── Configure the site ────────────────────────────────────────────────────
  if (action === 'configure') {
    const domains = netlifySiteDomains(site)

    // An explicitly chosen domain must be one the site actually answers on.
    // Otherwise prefer the site's primary custom domain, then its netlify.app name.
    let primaryDomain: string
    if (body.domain) {
      if (!domains.includes(body.domain)) {
        return error(`Domain "${body.domain}" is not attached to this site.`)
      }
      primaryDomain = body.domain
    } else {
      primaryDomain = site.custom_domain || `${site.name}.netlify.app`
    }

    // SITE_URL becomes the WebAuthn relying-party ID and cannot be changed once the
    // admin registers a passkey in the next step, so a domain that is not serving
    // the site yet must not be baked in. The wizard disables its own button for
    // this; this is the check that counts.
    const state = await getDomainState(token, site, primaryDomain)
    if (state.misconfigured) {
      return error(
        `Domain "${primaryDomain}" is not ready: its DNS is not pointing at Netlify yet, or Netlify has not finished issuing its certificate. Add the DNS record the wizard listed, then try again.`
      )
    }

    const siteUrl = `https://${primaryDomain}`
    const vars: HostEnvVar[] = [
      { key: 'NETLIFY_API_TOKEN', value: token, secret: true },
      { key: 'NETLIFY_SITE_ID', value: site.id, secret: false },
      { key: 'SESSION_SECRET', value: randomBytes(48).toString('hex'), secret: true },
      { key: 'ENCRYPTION_KEY', value: randomBytes(32).toString('hex'), secret: true },
      // The scheduled function sends this as a bearer token and every cron route
      // checks it, so it is minted here with the other internal secrets and a new
      // site's scheduled jobs work from the first deploy.
      { key: 'CRON_SECRET', value: randomBytes(32).toString('hex'), secret: true },
      { key: 'SITE_URL', value: siteUrl, secret: false },
      { key: 'NEXT_PUBLIC_SITE_URL', value: siteUrl, secret: false },
    ]
    if (body.neonApiKey) {
      vars.push({ key: 'NEON_API_KEY', value: body.neonApiKey.trim(), secret: true })
    }
    const repo = netlifyGithubRepo(site)
    if (repo) vars.push({ key: 'GITHUB_REPO', value: repo, secret: false })

    try {
      await upsertHostEnvVars({ provider: 'netlify', token, siteId: site.id }, vars)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return error(`Failed to write environment variables: ${message}`, 502)
    }

    // No redeploy yet: the wizard waits until DATABASE_URL is also saved so one
    // build picks up every bootstrap var at once.
    return NextResponse.json({ status: 'configured', siteUrl })
  }

  return error(`Unknown action: ${action ?? '(none)'}`)
}
