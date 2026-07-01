import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createHash } from 'crypto'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { getClientIp, checkAndRecord } from '@/lib/auth/rate-limit'
import { errorResponse } from '@/lib/utils'
import type { ConsentBannerConfig } from '@/lib/consent/types'

const PostBody = z.object({
  consentId: z.string().uuid(),
  action: z.enum(['accept_all', 'reject_all', 'custom', 'withdraw', 'acknowledge']),
  decision: z.record(z.string(), z.boolean()),
  categoriesVersion: z.number().int().min(0),
})

function truncateIp(ip: string): string {
  if (ip === 'unknown') return ip
  if (ip.includes(':')) {
    // IPv6: keep first three hextets (/48 prefix), zero the rest
    const parts = ip.split(':')
    return parts.slice(0, 3).join(':') + '::'
  }
  // IPv4: zero the last octet
  const parts = ip.split('.')
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0`
  return ip
}

function hashUserAgent(ua: string | null): string | null {
  if (!ua) return null
  return createHash('sha256').update(ua).digest('hex')
}

export async function POST(request: NextRequest) {
  const rawIp = await getClientIp(request)
  const consentIdCookie = request.cookies.get('cactus-consent-id')?.value ?? ''

  const identifiers = [`ip:${rawIp}`]
  if (consentIdCookie) identifiers.push(`consent:${consentIdCookie}`)

  const limit = await checkAndRecord('consent', identifiers)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: limit.retryAfterMs
          ? { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) }
          : {},
      }
    )
  }

  const parsed = PostBody.safeParse(await request.json())
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input')

  const { consentId, action, decision, categoriesVersion } = parsed.data

  // Validate decision keys against current config
  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { consentBannerConfig: true },
  })
  const bannerConfig = config?.consentBannerConfig as ConsentBannerConfig | null
  if (bannerConfig) {
    const validKeys = new Set(bannerConfig.categories.map((c) => c.key))
    for (const key of Object.keys(decision)) {
      if (!validKeys.has(key)) return errorResponse(`Unknown consent category: ${key}`)
    }
  }

  const user = await getSessionFromCookie().catch(() => null)
  const userId = user?.id ?? null

  const ipTruncated = truncateIp(rawIp)
  const uaHash = hashUserAgent(request.headers.get('user-agent'))

  await prisma.consentRecord.create({
    data: {
      consentId,
      userId,
      categoriesVersion,
      decision,
      action,
      ipTruncated,
      uaHash,
    },
  })

  const response = NextResponse.json({ ok: true })

  // Issue cactus-consent-id cookie if not already present
  if (!consentIdCookie) {
    response.cookies.set('cactus-consent-id', consentId, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365 * 2, // 2 years
    })
  }

  return response
}

export async function GET(request: NextRequest) {
  const consentId = request.cookies.get('cactus-consent-id')?.value
  if (!consentId) return NextResponse.json({ decision: null })

  const record = await prisma.consentRecord.findFirst({
    where: { consentId },
    orderBy: { createdAt: 'desc' },
    select: { decision: true, categoriesVersion: true, action: true, createdAt: true },
  })

  return NextResponse.json({ decision: record ?? null })
}
