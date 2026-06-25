import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export async function POST() {
  try {
    const [config, adminUser] = await Promise.all([
      prisma.siteConfig.findUnique({
        where: { id: 'singleton' },
        select: { setupCompleted: true, adminPath: true, siteName: true, timezone: true },
      }),
      prisma.user.findFirst({
        where: { role: { isProtected: true } },
        select: { username: true, email: true },
      }),
    ])

    return NextResponse.json({
      setupCompleted: config?.setupCompleted ?? false,
      adminPath: config?.adminPath ?? null,
      siteName: config?.siteName ?? null,
      timezone: config?.timezone ?? null,
      admin: adminUser ? { username: adminUser.username, email: adminUser.email } : null,
    })
  } catch {
    return NextResponse.json({
      setupCompleted: false,
      adminPath: null,
      siteName: null,
      timezone: null,
      admin: null,
    })
  }
}
