import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { errorResponse } from '@/lib/utils'

// Self-service data export: returns a JSON of profile fields, passkey metadata
// (never key material), active sessions, and role. GDPR Art. 20.
export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)

  const [passkeys, sessions, consentRecords] = await Promise.all([
    prisma.passkey.findMany({
      where: { userId: user.id },
      select: { id: true, credentialId: true, transports: true, createdAt: true },
    }),
    prisma.session.findMany({
      where: { userId: user.id, expiresAt: { gt: new Date() } },
      select: { id: true, createdAt: true, expiresAt: true },
    }),
    prisma.consentRecord.findMany({
      where: { userId: user.id },
      select: { id: true, categoriesVersion: true, decision: true, action: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const exportData = {
    exportedAt: new Date().toISOString(),
    profile: {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      createdAt: user.createdAt,
      emailVerifiedAt: user.emailVerifiedAt,
      acceptedPrivacyPolicyAt: user.acceptedPrivacyPolicyAt,
    },
    role: {
      name: user.role.name,
      isProtected: user.role.isProtected,
    },
    passkeys: passkeys.map((pk) => ({
      id: pk.id,
      credentialId: pk.credentialId,
      transports: pk.transports,
      createdAt: pk.createdAt,
      note: 'Public key material is not included in this export.',
    })),
    activeSessions: sessions.map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
    })),
    consentRecords: consentRecords.map((r) => ({
      id: r.id,
      categoriesVersion: r.categoriesVersion,
      decision: r.decision,
      action: r.action,
      createdAt: r.createdAt,
    })),
  }

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="cactus-data-export-${user.id}.json"`,
    },
  })
}
