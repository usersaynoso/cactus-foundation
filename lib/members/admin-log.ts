import { prisma } from '@/lib/db/prisma'
import type { Prisma } from '@prisma/client'
import type { SessionUser } from '@/lib/auth/session'

// Every admin mutation on a member writes one of these rows (see
// MEMBERS_SPEC.md Admin tools - action log). actorId/actorName are a
// snapshot, not a live relation, so the log survives the admin user being
// deleted later (mirrors MemberAdminNote's own author snapshot).
export async function logMemberAdminAction(
  actor: SessionUser,
  memberId: string,
  action: string,
  detail?: Record<string, unknown>
): Promise<void> {
  await prisma.memberAdminActionLog.create({
    data: {
      memberId,
      actorId: actor.id,
      actorName: actor.displayName || actor.username,
      action,
      ...(detail ? { detail: detail as unknown as Prisma.InputJsonValue } : {}),
    },
  })
}
