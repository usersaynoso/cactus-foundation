import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { restoreDatabaseFromSql } from '@/lib/backup/restore'

// Restore a Cactus backup (.sql from GET /api/admin/backup/database) during the
// first-run setup wizard, once the database is connected but before an admin
// exists. This is an unauthenticated endpoint - it is gated to refuse the moment
// setup is complete, exactly like /api/setup/read-state, so it can never be used
// to wipe a live site.

export const maxDuration = 60

const MAX_BYTES = 100 * 1024 * 1024

export async function POST(req: NextRequest) {
  // Refuse once the site is live: setup is done as soon as a protected-role user
  // exists. Restoring a backup that includes such a user makes this true, so the
  // endpoint self-closes after a successful import too.
  const [config, userCount] = await Promise.all([
    prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: { setupCompleted: true },
    }),
    prisma.user.count(),
  ])
  if (config?.setupCompleted && userCount > 0) {
    return new NextResponse(null, { status: 404 })
  }

  let sql: string
  try {
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No backup file was uploaded.' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'That backup file is too large to restore.' }, { status: 413 })
    }
    sql = await file.text()
  } catch {
    return NextResponse.json({ error: 'Could not read the uploaded file.' }, { status: 400 })
  }

  try {
    const result = await restoreDatabaseFromSql(sql)
    // Read the adminPath the backup just wrote so the wizard can send the owner
    // straight to their login.
    const restored = await prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: { adminPath: true },
    })
    return NextResponse.json({
      ok: true,
      ...result,
      loginPath: restored?.adminPath ? `/${restored.adminPath}/login` : '/',
    })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Restore failed.' },
      { status: 500 },
    )
  }
}
