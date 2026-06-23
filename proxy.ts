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
import { getAdminPathCached, getSiteStatusCached } from '@/lib/config/site'
import { validateSession } from '@/lib/auth/session'
import { isEdgeConfigWritable } from '@/lib/config/env'

// CSP allows inline styles/scripts because Next.js server components inject them.
// External image origins are added when CLOUDFLARE_WORKER_HOSTNAME is set.
function buildCsp(): string {
  const workerHost = process.env.CLOUDFLARE_WORKER_HOSTNAME
  const imgSrc = ['self', 'data:', 'blob:', workerHost ? `https://${workerHost}` : '']
    .filter(Boolean)
    .join(' ')
  return [
    `default-src 'self'`,
    `script-src 'self' 'unsafe-inline' 'unsafe-eval'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src ${imgSrc}`,
    `font-src 'self'`,
    `connect-src 'self'`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ].join('; ')
}

const SECURITY_HEADERS: [string, string][] = [
  ['Content-Security-Policy', buildCsp()],
  ['X-Frame-Options', 'DENY'],
  ['X-Content-Type-Options', 'nosniff'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=()'],
  ['Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload'],
]

function withSecurity(res: NextResponse): NextResponse {
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

  // ── 1. First-run gate ──────────────────────────────────────────────────────
  let setupCompleted = false
  try {
    const { prisma } = await import('@/lib/db/prisma')
    const cfg = await prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: { setupCompleted: true },
    })
    setupCompleted = cfg?.setupCompleted ?? false
  } catch {
    setupCompleted = false
  }

  if (!setupCompleted) {
    if (SETUP_PASS.some((p) => pathname.startsWith(p))) {
      return withSecurity(NextResponse.next())
    }
    return withSecurity(NextResponse.redirect(new URL('/setup', request.url)))
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
        const res = NextResponse.rewrite(target)
        res.headers.set('x-cactus-admin-path', adminPath)
        return withSecurity(res)
      }

      // All other admin pages: validate session first
      const token = sessionToken(request)
      if (token) {
        try {
          const user = await validateSession(token)
          if (user) {
            const target = new URL(`${ADMIN_INTERNAL}${sub}`, request.url)
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

  // ── 3. Site status gate for public routes ─────────────────────────────────
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

  return withSecurity(NextResponse.next())
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|.*\\.(?:ico|png|jpg|jpeg|svg|webp|gif|woff|woff2|ttf|eot|css|js)).*)',
  ],
}
