import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'

// Exported so admin UIs that list the User-facing `Role` table (staff role
// dropdown, Roles & Permissions page) can filter this row out - it's a
// Member-facing role, not a staff one, and doesn't belong in either list.
export const MEMBERS_ROLE_NAME = 'Members'

// Lazily seeded on first registration rather than at migration time - mirrors
// how the Admin role is seeded lazily during first-admin setup. NOT
// isProtected: that flag means "bypass all permission checks" (see
// lib/permissions/check.ts isAdmin()), which would wrongly grant every
// Member full admin rights the moment permission checks are added for them.
export async function getOrCreateMembersRoleId(): Promise<string> {
  const existing = await prisma.role.findFirst({ where: { name: MEMBERS_ROLE_NAME } })
  if (existing) return existing.id

  try {
    const created = await prisma.role.create({ data: { name: MEMBERS_ROLE_NAME, isProtected: false } })
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
