import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { restoreDatabaseFromSql, type RestoreGuardDb } from '@/lib/backup/restore'

// Restore a Cactus backup (.sql from GET /api/admin/backup/database) during the
// first-run setup wizard, once the database is connected but before an admin
// exists. This is an unauthenticated endpoint, so it refuses the moment anyone
// could have a stake in the database: once setup is complete, and also as soon
// as a protected-role (admin) account exists. The second half matters because
// the wizard creates the admin before it marks setup complete - that gap used
// to leave a site with a real admin restorable by anyone who found the URL.

export const maxDuration = 60

const MAX_BYTES = 100 * 1024 * 1024

class SetupClosedError extends Error {}

// Why an unauthenticated restore must be refused right now, or null if setup is
// still genuinely open. Runs twice: once up front so a refused caller never
// uploads 100MB for nothing, and again inside the restore transaction under its
// lock, so two uploads racing through the first check cannot both proceed.
async function setupClosedReason(db: RestoreGuardDb): Promise<string | null> {
  const rows = await db.$queryRawUnsafe<Array<{ completed: boolean | null; any_user: boolean; any_admin: boolean }>>(
    `SELECT
       (SELECT "setupCompleted" FROM "SiteConfig" WHERE "id" = 'singleton') AS completed,
       EXISTS (SELECT 1 FROM "User") AS any_user,
       EXISTS (SELECT 1 FROM "User" u JOIN "Role" r ON r."id" = u."roleId" WHERE r."isProtected") AS any_admin`,
  )
  const state = rows[0]
  if (!state) return null
  if (state.completed && state.any_user) return 'complete'
  if (state.any_admin) return 'An admin account has already been created on this site, so a backup can no longer be restored from setup. Sign in and restore it from Settings instead.'
  return null
}

export async function POST(req: NextRequest) {
  const closed = await setupClosedReason(prisma)
  // Fully set-up sites 404, exactly like /api/setup/read-state - the endpoint
  // should not even admit to existing on a live site.
  if (closed === 'complete') return new NextResponse(null, { status: 404 })
  if (closed) return NextResponse.json({ error: closed }, { status: 409 })

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
    const result = await restoreDatabaseFromSql(sql, undefined, {
      guard: async (tx) => {
        const reason = await setupClosedReason(tx)
        if (reason) throw new SetupClosedError(reason === 'complete' ? 'Setup is already complete on this site.' : reason)
      },
    })
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
    if (err instanceof SetupClosedError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Restore failed.' },
      { status: 500 },
    )
  }
}
