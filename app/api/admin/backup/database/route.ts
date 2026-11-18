import { readFileSync } from 'fs'
import path from 'path'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { buildBackupSql } from '@/lib/backup/dump'
import { UnsupportedColumnError, UnrestorableBackupError } from '@/lib/backup/serialize'
import { getSessionFromCookie } from '@/lib/auth/session'
import { isAdmin } from '@/lib/permissions/check'
import { confirmStepUp } from '@/lib/auth/step-up'

// Full logical SQL backup (schema + data + sequence counters) of the live
// database, generated on demand and streamed straight to the browser - no object
// storage provider involved. Restore target is always a fresh, empty database:
// run the schema section (identical to
// prisma/migrations/20260626000000_init/migration.sql), then the data section.
//
// The dump itself lives in lib/backup/dump.ts so the round-trip test can drive it
// against a throwaway database.

export const maxDuration = 60

const SCHEMA_MIGRATION_PATH = path.join(
  process.cwd(),
  'prisma/migrations/20260626000000_init/migration.sql',
)

// POST, not GET, and only with the password typed again (lib/auth/step-up.ts).
// This file is every customer, order and account on the site in one download, so
// a signed-in session alone - a borrowed laptop, a stolen cookie - is not enough.
const BodySchema = z.object({ password: z.string().max(1024).optional() })

export async function POST(req: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!isAdmin(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  const step = await confirmStepUp(user, parsed.data.password)
  if (!step.ok) return NextResponse.json({ error: step.error }, { status: step.status })

  let schemaSql: string
  try {
    schemaSql = readFileSync(SCHEMA_MIGRATION_PATH, 'utf8')
  } catch {
    return NextResponse.json({ error: 'Could not read database schema file' }, { status: 500 })
  }

  const timestamp = new Date().toISOString()

  let sql: string
  try {
    sql = await buildBackupSql(prisma, schemaSql, timestamp)
  } catch (err: unknown) {
    // A column the backup can't faithfully write aborts the whole thing rather
    // than handing the owner a file that would fail to restore. Its message is
    // already written for a human.
    if (err instanceof UnsupportedColumnError || err instanceof UnrestorableBackupError) {
      return NextResponse.json({ error: err.message }, { status: 500 })
    }
    throw err
  }

  return new NextResponse(sql, {
    headers: {
      'Content-Type': 'application/sql',
      'Content-Disposition': `attachment; filename="cactus-backup-${timestamp.replace(/[:.]/g, '-')}.sql"`,
    },
  })
}
