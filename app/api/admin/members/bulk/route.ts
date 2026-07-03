import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { logMemberAdminAction } from '@/lib/members/admin-log'

const ACTION_PERMISSIONS = {
  suspend: 'members.suspend',
  unsuspend: 'members.suspend',
  approve: 'members.approve',
  reject: 'members.approve',
  trust: 'members.trust',
  untrust: 'members.trust',
  delete: 'members.delete',
} as const

const Body = z.object({
  ids: z.array(z.string()).min(1).max(200),
  action: z.enum(['suspend', 'unsuspend', 'approve', 'reject', 'trust', 'untrust', 'delete']),
})

export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  const { ids, action } = parsed.data

  if (!(await hasPermission(user, ACTION_PERMISSIONS[action]))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let done = 0
  let skipped = 0

  for (const id of ids) {
    try {
      switch (action) {
        case 'suspend':
          await prisma.member.update({ where: { id }, data: { status: 'SUSPENDED', suspensionNotified: false } })
          await prisma.memberSession.deleteMany({ where: { memberId: id } })
          break
        case 'unsuspend':
          await prisma.member.update({ where: { id }, data: { status: 'ACTIVE', suspensionReason: null, suspendedUntil: null } })
          break
        case 'approve':
          await prisma.member.update({ where: { id, status: 'PENDING_APPROVAL' }, data: { status: 'ACTIVE' } })
          break
        case 'reject': {
          const result = await prisma.member.deleteMany({ where: { id, status: 'PENDING_APPROVAL' } })
          if (result.count === 0) { skipped++; continue }
          break
        }
        case 'trust':
          await prisma.member.update({ where: { id }, data: { trusted: true } })
          break
        case 'untrust':
          await prisma.member.update({ where: { id }, data: { trusted: false } })
          break
        case 'delete':
          await prisma.member.delete({ where: { id } })
          break
      }
      if (action !== 'delete' && action !== 'reject') {
        await logMemberAdminAction(user, id, `bulk_${action}`)
      }
      done++
    } catch {
      skipped++
    }
  }

  return NextResponse.json({ done, skipped })
}
