import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'

const MEMBERS_ROLE_NAME = 'Members'

// Lazily seeded on first registration rather than at migration time - mirrors
// how the Admin role is seeded lazily during first-admin setup. Protected so
// it can't be deleted out from under existing members (see roles DELETE route).
export async function getOrCreateMembersRoleId(): Promise<string> {
  const existing = await prisma.role.findFirst({ where: { name: MEMBERS_ROLE_NAME } })
  if (existing) return existing.id

  try {
    const created = await prisma.role.create({ data: { name: MEMBERS_ROLE_NAME, isProtected: true } })
    return created.id
  } catch (err) {
    // Concurrent registration already created it - refetch instead of failing.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const role = await prisma.role.findFirst({ where: { name: MEMBERS_ROLE_NAME } })
      if (role) return role.id
    }
    throw err
  }
}
