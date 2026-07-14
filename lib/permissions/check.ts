import { prisma } from '@/lib/db/prisma'
import type { SessionUser } from '@/lib/auth/session'

// Core permission keys registered at startup
export const CORE_PERMISSIONS = [
  { key: 'pages.read', description: 'View info pages (including drafts)' },
  { key: 'pages.write', description: 'Create and edit info pages' },
  { key: 'pages.publish', description: 'Publish and unpublish info pages' },
  { key: 'pages.delete', description: 'Delete info pages' },
  { key: 'users.manage', description: 'View and manage non-admin users' },
  { key: 'media.upload', description: 'Upload media files' },
  { key: 'media.delete', description: 'Delete media files' },
  { key: 'roles.manage', description: 'Create and edit roles and permissions' },
  { key: 'modules.manage', description: 'Install, update, and disable modules' },
  { key: 'config.manage', description: 'Edit site configuration' },
  { key: 'menus.manage', description: 'Create and manage navigation menus' },
  { key: 'appearance.manage', description: 'Edit site header, footer, and design tokens' },
  { key: 'layouts.manage', description: 'Create, edit, and assign page layouts' },
  // Members system (see MEMBERS_SPEC.md)
  { key: 'members.manage', description: 'Full access to the Members admin section' },
  { key: 'members.list', description: 'View the member list' },
  { key: 'members.view', description: 'View individual member detail' },
  { key: 'members.edit', description: 'Edit member profiles and settings' },
  { key: 'members.suspend', description: 'Suspend and unsuspend members' },
  { key: 'members.delete', description: 'Delete member accounts' },
  { key: 'members.invite', description: 'Generate and revoke member invite links' },
  { key: 'members.approve', description: 'Approve pending members' },
  { key: 'members.trust', description: 'Set and unset the trusted member flag' },
  { key: 'members.notes', description: 'Add internal admin notes on members' },
  { key: 'members.settings', description: 'Edit Members system settings' },
  { key: 'members.gdpr', description: 'Access the members GDPR dashboard' },
  { key: 'members.email-templates', description: 'Edit member email templates' },
] as const

export type CorePermissionKey = (typeof CORE_PERMISSIONS)[number]['key']

// Protected roles (isProtected = true) bypass all permission checks.
// Only Admin is seeded as protected.
export function isAdmin(user: SessionUser): boolean {
  return user.role.isProtected
}

// Check whether a user has a specific permission.
// Protected roles short-circuit to true immediately.
export async function hasPermission(
  user: SessionUser,
  permissionKey: string
): Promise<boolean> {
  if (isAdmin(user)) return true

  const rp = await prisma.rolePermission.findUnique({
    where: {
      roleId_permissionKey: {
        roleId: user.roleId,
        permissionKey,
      },
    },
  })
  return !!rp
}

// Batch check — returns a map of permissionKey → boolean.
// More efficient than calling hasPermission N times: one query for the lot,
// rather than one database round-trip per key.
export async function hasPermissions(
  user: SessionUser,
  keys: string[]
): Promise<Record<string, boolean>> {
  // Nothing to check - don't spend a round-trip proving it.
  if (keys.length === 0) return {}

  if (isAdmin(user)) {
    return Object.fromEntries(keys.map((k) => [k, true]))
  }

  const granted = await prisma.rolePermission.findMany({
    where: { roleId: user.roleId, permissionKey: { in: keys } },
    select: { permissionKey: true },
  })
  const grantedSet = new Set(granted.map((r) => r.permissionKey))
  return Object.fromEntries(keys.map((k) => [k, grantedSet.has(k)]))
}

// Seed core permissions into the Permission table.
// Safe to call multiple times (upsert).
export async function seedCorePermissions(): Promise<void> {
  await Promise.all(
    CORE_PERMISSIONS.map((p) =>
      prisma.permission.upsert({
        where: { key: p.key },
        create: { key: p.key, description: p.description, module: null },
        update: { description: p.description },
      })
    )
  )
}

// Guard for protected admin operations: only a protected-role user can act on
// another protected-role user's account (suspend, delete, role-change).
export function canActOnUser(
  actor: SessionUser,
  targetRole: { isProtected: boolean }
): boolean {
  if (targetRole.isProtected && !isAdmin(actor)) return false
  return true
}

// Ensure there will still be at least one protected-role user after a deletion
// or role change. Must be called inside a Prisma $transaction.
export async function assertProtectedUserWouldRemain(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  excludeUserId: string
): Promise<void> {
  const protectedRoles = await tx.role.findMany({
    where: { isProtected: true },
    select: { id: true },
  })
  const protectedRoleIds = protectedRoles.map((r) => r.id)

  const count = await tx.user.count({
    where: {
      roleId: { in: protectedRoleIds },
      id: { not: excludeUserId },
      suspendedAt: null,
    },
  })

  if (count === 0) {
    throw new Error(
      'This action would leave the site with no active admin accounts. ' +
        'Promote another user to Admin first.'
    )
  }
}
