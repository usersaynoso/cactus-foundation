// Next.js 16 proxy.ts — runs on the Node.js runtime only (no Edge).
// Replaces middleware.ts; can use Prisma directly.
//
// Responsibilities:
//   1. First-run redirect: send everything to /setup until setupCompleted.
//   2. Block direct access to the internal /cactus-admin/* path.
//   3. Admin path enforcement: rewrite /<adminPath>[/*] to /cactus-admin[/*],
//      checking authentication first. Anything that doesn't match the configured
//      prefix just falls through — a plain 404 from Next.js, indistinguishable
//      from any other missing route.
//   4. Site status gate: block public routes with the status page when status ≠ live,
//      unless the requester has an admin session.
//
// Admin path and site status are read from Edge Config when write credentials are
// present; otherwise from a direct Prisma read briefly cached in memory (safe here
// because proxy.ts runs on the Node.js runtime, not Edge).

import { NextRequest, NextResponse } from 'next/server'
import { getAdminPathFromEdgeConfig, getSiteStatusFromEdgeConfig } from '@/lib/config/edge-config'
import { getAdminPathCached, getSiteStatusCached, getPendingRedeployIdCached, getPendingRedeployIdUncached } from '@/lib/config/site'
import { validateSession } from '@/lib/auth/session'
import { isEdgeConfigWritable, isLocalMode } from '@/lib/config/env'
import { getMemberAreaPath, MEMBER_INTERNAL } from '@/lib/members/paths'
import { getMembersConfigCached } from '@/lib/members/config'
import { validateMemberSession } from '@/lib/members/session'
import { getModuleRouteTiersCached } from '@/lib/modules/member-extensions'
import { isPathExcepted, resolveRouteTier } from '@/lib/members/access'

// CSP allows inline styles/scripts because Next.js server components inject them.
// External image origins are added when CLOUDFLARE_WORKER_HOSTNAME is set.
function buildCsp(): string {
  const workerHost = process.env.CLOUDFLARE_WORKER_HOSTNAME
  const imgSrc = [
    "'self'", 'data:', 'blob:',
    // Style guide demo images
    'https://picsum.photos', 'https://fastly.picsum.photos',
    workerHost ? `https://${workerHost}` : '',
  ].filter(Boolean).join(' ')
  return [
    `default-src 'self'`,
    // https://js.stripe.com - Shop module Stripe Elements checkout (PROTECTED, Q6)
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `img-src ${imgSrc}`,
    `font-src 'self' https://fonts.gstatic.com`,
    // https://api.stripe.com - Shop module Stripe Elements checkout (PROTECTED, Q6)
    `connect-src 'self' https://api.stripe.com`,
    // Stripe Elements renders card fields and 3D Secure challenges in hidden iframes
    `frame-src 'self' https://js.stripe.com https://hooks.stripe.com`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self' https://github.com`,
  ].join('; ')
}

const SECURITY_HEADERS: [string, string][] = [
  ['Content-Security-Policy', buildCsp()],
  ['X-Frame-Options', 'DENY'],
  ['X-Content-Type-Options', 'nosniff'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=(), publickey-credentials-create=(self), publickey-credentials-get=(self)'],
  ['Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload'],
]

function withSecurity(res: NextResponse): NextResponse {
  // Security headers serve no purpose on localhost and actively break Turbopack
  // HMR (blob: workers), source maps, and DevTools in development.
  if (process.env.NODE_ENV === 'development') return res
  for (const [name, value] of SECURITY_HEADERS) {
    res.headers.set(name, value)
  }
  return res
}

// Internal prefix that /cactus-admin/* routes live under.
// Requests are rewritten here from /<adminPath>/*; direct access is blocked.
const ADMIN_INTERNAL = '/cactus-admin'

// Paths that bypass every gate unconditionally.
const ALWAYS_PASS = [
  '/api/health',
  '/api/webhooks/',
  '/_next/',
  '/favicon.ico',
]

// Paths allowed during first-run setup (before setupCompleted = true).
const SETUP_PASS = [
  '/setup',
  '/api/setup',
  '/api/auth/passkey/',
  '/api/auth/totp/',
  '/api/health',
  '/_next/',
  '/favicon.ico',
]

async function resolveAdminPath(): Promise<string | null> {
  if (isEdgeConfigWritable()) {
    const p = await getAdminPathFromEdgeConfig()
    if (p) return p
  }
  return getAdminPathCached()
}

async function resolveSiteStatus() {
  if (isEdgeConfigWritable()) {
    const s = await getSiteStatusFromEdgeConfig()
    if (s) return s
  }
  return getSiteStatusCached()
}

function sessionToken(request: NextRequest): string | null {
  return request.cookies.get('cactus_session')?.value ?? null
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

// Defence-in-depth against cross-site request forgery: the session cookie is
// already SameSite=lax + httpOnly, which blocks the common cross-site POST
// vector, but this adds an explicit check. Only rejects when a browser-sent
// Origin header is present and doesn't match — non-browser clients (which
// send no Origin) are unaffected, so this never replaces session auth.
function originMismatch(request: NextRequest): boolean {
  if (SAFE_METHODS.has(request.method)) return false
  const origin = request.headers.get('origin')
  if (!origin) return false
  return origin !== request.nextUrl.origin
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl

  // ── Always-pass paths ──────────────────────────────────────────────────────
  if (ALWAYS_PASS.some((p) => pathname.startsWith(p))) {
    return withSecurity(NextResponse.next())
  }

  // ── Block direct access to the internal admin prefix ──────────────────────
  if (pathname.startsWith(ADMIN_INTERNAL)) {
    return new NextResponse(null, { status: 404 })
  }

  // ── Block direct access to the internal member-area prefix ────────────────
  if (pathname.startsWith(MEMBER_INTERNAL)) {
    return new NextResponse(null, { status: 404 })
  }

  // ── 1. First-run gate ──────────────────────────────────────────────────────
  // Also treat the site as not-set-up when setupCompleted is true but all
  // user accounts were deleted — lets /api/setup/reset trigger a re-run.
  let setupCompleted = false
  try {
    const { prisma } = await import('@/lib/db/prisma')
    const [cfg, userCount] = await Promise.all([
      prisma.siteConfig.findUnique({
        where: { id: 'singleton' },
        select: { setupCompleted: true },
      }),
      prisma.user.count(),
    ])
    setupCompleted = (cfg?.setupCompleted ?? false) && userCount > 0
  } catch {
    setupCompleted = false
  }

  if (!setupCompleted) {
    if (SETUP_PASS.some((p) => pathname.startsWith(p))) {
      return withSecurity(NextResponse.next())
    }
    return withSecurity(NextResponse.redirect(new URL('/setup', request.url)))
  }

  // Setup is complete — /setup and /api/setup/* are dead paths (except /api/setup/reset,
  // which is guarded at the route level and handles the "all users deleted" re-setup case).
  if (pathname === '/setup' || pathname.startsWith('/setup/')) {
    return new NextResponse(null, { status: 404 })
  }

  // ── 2. Admin path enforcement ──────────────────────────────────────────────
  const adminPath = await resolveAdminPath()

  if (adminPath) {
    const prefix = `/${adminPath}`
    const isAdminRequest =
      pathname === prefix ||
      pathname.startsWith(prefix + '/')

    if (isAdminRequest) {
      // Sub-path after the admin prefix (e.g. "/config", "/login")
      const sub = pathname.slice(prefix.length) || '/'
      const loginSub = '/login'

      // Login page: rewrite without auth check
      if (sub === loginSub || sub.startsWith(loginSub + '/')) {
        const target = new URL(`${ADMIN_INTERNAL}${sub}`, request.url)
        target.search = request.nextUrl.search
        const res = NextResponse.rewrite(target)
        res.headers.set('x-cactus-admin-path', adminPath)
        res.headers.set('x-cactus-is-login', '1')
        return withSecurity(res)
      }

      // All other admin pages: validate session first
      const token = sessionToken(request)
      if (token) {
        try {
          const user = await validateSession(token)
          if (user) {
            // Local dev points at the shared Tester DB (see CLAUDE.md); a live
            // redeploy there sets this flag and would otherwise trap local admin
            // sessions on the redeploying screen too. Local never has a Vercel
            // deploy of its own, so this gate is meaningless here.
            let pendingRedeployId = isLocalMode() ? null : await getPendingRedeployIdCached()
            if (pendingRedeployId) {
              // The cached value can be stale across serverless isolates: the dismiss DELETE
              // clears the flag and the API isolate's cache, but not this isolate's copy.
              // Confirm against the DB before trapping the admin on the redeploying page.
              pendingRedeployId = await getPendingRedeployIdUncached()
            }
            if (pendingRedeployId) {
              const redeployingUrl = new URL('/cactus-status/redeploying', request.url)
              const res = NextResponse.rewrite(redeployingUrl)
              res.headers.set('x-cactus-admin-path', adminPath)
              return withSecurity(res)
            }
            const target = new URL(`${ADMIN_INTERNAL}${sub}`, request.url)
            target.search = request.nextUrl.search
            const res = NextResponse.rewrite(target)
            res.headers.set('x-cactus-admin-path', adminPath)
            res.headers.set('x-cactus-user-id', user.id)
            res.headers.set('x-cactus-role-protected', String(user.role.isProtected))
            return withSecurity(res)
          }
        } catch {
          // Fall through to redirect
        }
      }

      // Not authenticated — redirect to login (at the public admin URL)
      const loginUrl = new URL(`${prefix}/login`, request.url)
      if (pathname !== prefix && sub !== '/') {
        loginUrl.searchParams.set('next', pathname)
      }
      return withSecurity(NextResponse.redirect(loginUrl))
    }
  }

  // ── 2.5 Member-area path rewrite ───────────────────────────────────────────
  // Rewrite only, no session validation here — the account layout
  // (app/(public)/cactus-account/layout.tsx) does its own session gate and
  // needs the original public path to build an accurate post-login redirect,
  // hence x-cactus-member-full-path below (the internal pathname is useless
  // for that — it's the same for every memberAreaPath value).
  const memberAreaPath = getMemberAreaPath()
  const memberPrefix = `/${memberAreaPath}`
  const isMemberRequest = pathname === memberPrefix || pathname.startsWith(memberPrefix + '/')

  if (isMemberRequest) {
    const sub = pathname.slice(memberPrefix.length) || '/'
    const target = new URL(`${MEMBER_INTERNAL}${sub}`, request.url)
    target.search = request.nextUrl.search
    const res = NextResponse.rewrite(target)
    res.headers.set('x-cactus-member-path', memberAreaPath)
    res.headers.set('x-cactus-member-full-path', pathname + request.nextUrl.search)
    return withSecurity(res)
  }

  // ── 3. Site status gate for public routes ─────────────────────────────────
  // API routes must always reach their handlers regardless of site status —
  // blocking them would break authentication, passkey registration, and all
  // other API functionality even for admins trying to log in.
  if (pathname.startsWith('/api/')) {
    if (originMismatch(request)) {
      return withSecurity(NextResponse.json({ error: 'Origin not allowed' }, { status: 403 }))
    }
    return withSecurity(NextResponse.next())
  }

  // Preview routes must always be reachable for logged-in editors,
  // even when the public site is gated behind coming-soon or maintenance.
  const isPreviewRoute = pathname.startsWith('/page-preview/') || pathname.startsWith('/layout-preview/')
  if (isPreviewRoute) {
    return withSecurity(NextResponse.next())
  }

  const status = await resolveSiteStatus()

  if (status && status !== 'live') {
    // Admins bypass the gate
    const token = sessionToken(request)
    if (token) {
      try {
        const user = await validateSession(token)
        if (user?.role.isProtected) return NextResponse.next()
      } catch {
        // Fall through
      }
    }

    const statusPage =
      status === 'comingSoon'
        ? '/cactus-status/coming-soon'
        : '/cactus-status/maintenance'
    return withSecurity(NextResponse.rewrite(new URL(statusPage, request.url)))
  }

  // ── 4. Members-only site access modes (Phase 8 of MEMBERS_SPEC.md) ────────
  // Only ordinary public content reaches this point — admin, api, preview,
  // and member-area (login/register/verify-email/account) requests have all
  // already returned above, so member-area paths are automatically excepted
  // without needing an explicit rule for them here. Two independent triggers:
  // membersConfig.siteWideMembersOnly (an all-or-nothing site lock, subject
  // to its own exceptions list) and per-path route tiers a module declares
  // via memberExtensions.routeTiers (gates that one path regardless of the
  // site-wide setting).
  const membersConfig = await getMembersConfigCached()
  const routeTiers = membersConfig.enabled ? await getModuleRouteTiersCached() : []
  const tier = resolveRouteTier(pathname, routeTiers)
  const siteWideGate = membersConfig.enabled && membersConfig.siteWideMembersOnly
  const requiresMember = siteWideGate || tier !== 'PUBLIC'

  if (requiresMember) {
    const excepted = siteWideGate && isPathExcepted(pathname, membersConfig.siteWideMembersOnlyExceptions)
    if (!excepted) {
      // Admins always bypass, same as the status gate above.
      const adminToken = sessionToken(request)
      if (adminToken) {
        try {
          const adminUser = await validateSession(adminToken)
          if (adminUser?.role.isProtected) return withSecurity(NextResponse.next())
        } catch {
          // Fall through
        }
      }

      const memberToken = request.cookies.get('cactus_member_session')?.value ?? null
      let member = null
      if (memberToken) {
        try {
          member = await validateMemberSession(memberToken)
        } catch {
          member = null
        }
      }

      const needsTrust = tier === 'TRUSTED_MEMBER'
      const satisfied = !!member && (!needsTrust || member.trusted)

      if (!satisfied) {
        if (membersConfig.guestPreviewEnabled) {
          // Teaser UI is scoped to what MemberGate/TrustedMemberGate blocks
          // render for this header today - a broader per-page teaser design
          // is flagged for review, not built here (see MEMBERS_SPEC.md Phase 8).
          const res = NextResponse.next()
          res.headers.set('x-cactus-guest-preview', '1')
          return withSecurity(res)
        }

        if (!member) {
          const loginUrl = new URL(`/${getMemberAreaPath()}/login`, request.url)
          loginUrl.searchParams.set('redirect', pathname + request.nextUrl.search)
          return withSecurity(NextResponse.redirect(loginUrl))
        }

        // Signed in but not trusted enough for a TRUSTED_MEMBER route - no
        // sensible page to redirect to (they're already logged in), and no
        // dedicated status page exists for this narrow case; 404 rather than
        // invent one, consistent with this codebase's "don't reveal existence"
        // handling elsewhere (e.g. HIDDEN profile visibility).
        return new NextResponse(null, { status: 404 })
      }
    }
  }

  return withSecurity(NextResponse.next())
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|.*\\.(?:ico|png|jpg|jpeg|svg|webp|gif|woff|woff2|ttf|eot|css|js)).*)',
  ],
}
