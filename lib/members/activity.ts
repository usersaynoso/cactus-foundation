import { prisma } from '@/lib/db/prisma'
import type { Prisma } from '@prisma/client'

// source: null = core event; otherwise the module name that emitted it (its
// `type` should be one declared in that module's manifest.memberExtensions.activityTypes).
export async function recordMemberActivity(
  memberId: string,
  type: string,
  opts?: { source?: string; metadata?: Record<string, unknown> }
): Promise<void> {
  await prisma.memberActivityEvent.create({
    data: {
      memberId,
      type,
      source: opts?.source ?? null,
      ...(opts?.metadata ? { metadata: opts.metadata as unknown as Prisma.InputJsonValue } : {}),
    },
  })
}

export async function listMemberActivity(memberId: string, limit = 50) {
  return prisma.memberActivityEvent.findMany({
    where: { memberId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
}
