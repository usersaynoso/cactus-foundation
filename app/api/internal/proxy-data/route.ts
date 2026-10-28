import { NextRequest, NextResponse } from 'next/server'
import {
  getAdminPathCached,
  getPageCacheCached,
  getSiteStatusCached,
  isFirstRunComplete,
  refreshFirstRunComplete,
} from '@/lib/config/site'
import { safeCompare, validateSession } from '@/lib/auth/session-core'
import { getMembersConfigCached } from '@/lib/members/config'
import { validateMemberSession } from '@/lib/members/session-core'
import { getModuleRouteTiersCached } from '@/lib/modules/member-extensions'
import { prismaGateFailureMeansUnconfigured } from '@/lib/proxy/gate-failure'
import {
  PROXY_KEY_HEADER,
  proxyKey,
  type ProxyGateFailure,
  type ProxySessionAnswer,
  type ProxySnapshot,
} from '@/lib/proxy/protocol'

// The database half of the proxy on Netlify, where proxy.ts runs as an edge
// function that cannot load Prisma (see lib/proxy/data.ts). It makes exactly the
// reads the Node proxy makes directly on Vercel, and nothing else.
//
// Deliberately imports the original functions, NOT lib/proxy/data: that module
// is aliased to the HTTP version on Netlify builds, which would have this route
// calling itself.
//
// Callers prove themselves with an HMAC of SESSION_SECRET (lib/proxy/protocol).
// Before setup has written SESSION_SECRET there is nothing to prove with - and
// nothing worth guarding either, since no admin path or session exists yet - so
// the snapshot answers openly with the admin path withheld, and session checks
// answer "nobody".

export const dynamic = 'force-dynamic'

type Access = 'ok' | 'open' | 'denied'

async function access(req: NextRequest): Promise<Access> {
  const secret = process.env.SESSION_SECRET
  if (!secret) return 'open'
  const presented = req.headers.get(PROXY_KEY_HEADER) ?? ''
  return safeCompare(presented, await proxyKey(secret)) ? 'ok' : 'denied'
}

function settled<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === 'fulfilled' ? result.value : null
}

export async function GET(req: NextRequest) {
  const who = await access(req)
  if (who === 'denied') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let firstRunComplete: boolean
  try {
    firstRunComplete =
      req.nextUrl.searchParams.get('fresh') === '1' ? await refreshFirstRunComplete() : await isFirstRunComplete()
  } catch (err) {
    const body: ProxyGateFailure = {
      error: err instanceof Error ? err.message : 'First-run read failed',
      unconfigured: prismaGateFailureMeansUnconfigured(err),
    }
    return NextResponse.json(body, { status: 503 })
  }

  const [adminPath, siteStatus, pageCache, membersConfig] = await Promise.allSettled([
    getAdminPathCached(),
    getSiteStatusCached(),
    getPageCacheCached(),
    getMembersConfigCached(),
  ])
  const members = settled(membersConfig)
  // Same short-circuit as proxy.ts: route tiers only matter with members on.
  const routeTiers = await Promise.allSettled([members?.enabled ? getModuleRouteTiersCached() : Promise.resolve([])])

  const failed: ProxySnapshot['failed'] = []
  if (adminPath.status === 'rejected') failed.push('adminPath')
  if (siteStatus.status === 'rejected') failed.push('siteStatus')
  if (pageCache.status === 'rejected') failed.push('pageCache')
  if (membersConfig.status === 'rejected') failed.push('membersConfig')
  if (routeTiers[0].status === 'rejected') failed.push('routeTiers')

  const body: ProxySnapshot = {
    firstRunComplete,
    adminPath: who === 'ok' ? settled(adminPath) : null,
    siteStatus: settled(siteStatus),
    pageCache: settled(pageCache),
    membersConfig: members,
    routeTiers: settled(routeTiers[0]),
    failed,
  }
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const who = await access(req)
  if (who === 'denied') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = (await req.json().catch(() => null)) as { kind?: unknown; token?: unknown } | null
  const token = typeof body?.token === 'string' ? body.token : ''
  if (body?.kind !== 'admin' && body?.kind !== 'member') {
    return NextResponse.json({ error: 'kind must be admin or member' }, { status: 400 })
  }

  if (body.kind === 'admin') {
    const user = who === 'ok' && token ? await validateSession(token) : null
    const answer: ProxySessionAnswer = {
      kind: 'admin',
      user: user ? { id: user.id, role: { isProtected: user.role.isProtected } } : null,
    }
    return NextResponse.json(answer, { headers: { 'Cache-Control': 'no-store' } })
  }

  const member = who === 'ok' && token ? await validateMemberSession(token) : null
  const answer: ProxySessionAnswer = { kind: 'member', member: member ? { trusted: member.trusted } : null }
  return NextResponse.json(answer, { headers: { 'Cache-Control': 'no-store' } })
}
