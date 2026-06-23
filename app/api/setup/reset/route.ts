import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

// Self-securing recovery endpoint: resets setupCompleted so the setup wizard
// can run again after an admin account is deleted.
// Only works when zero users exist in the database — if any user remains
// this returns 403, so the endpoint cannot be used to hijack a live site.
export async function POST() {
  const userCount = await prisma.user.count()
  if (userCount > 0) {
    return NextResponse.json(
      { error: 'Cannot reset setup while user accounts exist' },
      { status: 403 }
    )
  }

  await prisma.siteConfig.updateMany({
    where: { id: 'singleton' },
    data: { setupCompleted: false },
  })

  return NextResponse.json({ ok: true })
}
