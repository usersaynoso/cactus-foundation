import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export async function POST() {
  try {
    // Setup is complete once a protected-role user exists — the wizard's job is
    // done at that point. Refuse to keep serving the admin path and admin
    // identity to unauthenticated callers for the life of the site.
    const [config, adminUser, userCount] = await Promise.all([
      prisma.siteConfig.findUnique({
        where: { id: 'singleton' },
        select: { setupCompleted: true, adminPath: true, siteName: true, timezone: true },
      }),
      prisma.user.findFirst({
        where: { role: { isProtected: true } },
        select: { id: true },
      }),
      prisma.user.count(),
    ])

    if (config?.setupCompleted && userCount > 0) {
      return new NextResponse(null, { status: 404 })
    }

    return NextResponse.json({
      setupCompleted: config?.setupCompleted ?? false,
      adminPath: config?.adminPath ?? null,
      siteName: config?.siteName ?? null,
      timezone: config?.timezone ?? null,
      // Only whether an admin exists: the wizard needs nothing more, and an
      // unauthenticated caller must not learn the admin's username or email.
      adminExists: !!adminUser,
    })
  } catch {
    return NextResponse.json({
      setupCompleted: false,
      adminPath: null,
      siteName: null,
      timezone: null,
      adminExists: false,
    })
  }
}
