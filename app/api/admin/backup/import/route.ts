import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { isAdmin } from '@/lib/permissions/check'
import { confirmStepUp } from '@/lib/auth/step-up'
import { restoreDatabaseFromSql } from '@/lib/backup/restore'

// Restore the database from an uploaded Cactus backup (.sql file produced by
// POST /api/admin/backup/database). Destructive: it replaces ALL current data.
// The admin's own session row is wiped along with everything else, so the client
// redirects to the (possibly restored) admin login afterwards.
//
// Needs the password typed again (lib/auth/step-up.ts), sent as the `password`
// form field: replacing every row on the site is not something a signed-in
// session alone - a borrowed laptop, a stolen cookie - should be able to do.

export const maxDuration = 60

const MAX_BYTES = 100 * 1024 * 1024 // 100 MB - backups are metadata-only, never blobs

export async function POST(req: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!isAdmin(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Could not read the uploaded file.' }, { status: 400 })
  }

  const password = form.get('password')
  const step = await confirmStepUp(user, typeof password === 'string' ? password : null)
  if (!step.ok) return NextResponse.json({ error: step.error }, { status: step.status })

  let sql: string
  try {
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
    const config = await prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: { adminPath: true },
    })
    return NextResponse.json({
      ok: true,
      ...result,
      loginPath: config?.adminPath ? `/${config.adminPath}/login` : '/setup',
    })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Restore failed.' },
      { status: 500 },
    )
  }
}
