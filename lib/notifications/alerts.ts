import { prisma } from '@/lib/db/prisma'
import type { NotificationType } from '@prisma/client'

// Generic on-demand alert helpers. Unlike deployment notifications (which append
// reasons to one open record), alerts are keyed by a stable dedupeKey so the same
// concern only ever holds a single notification: core-update (one ever),
// module-update:{moduleId} (one per module), contact-form:messages (one rolling).

type UpsertAlert = {
  type: NotificationType
  dedupeKey: string
  title: string
  link: string
}

// Create the alert if none exists; re-surface (mark unread) when the title changes
// so a notice only re-lights the bell when the underlying state actually changes
// (e.g. a newer version becomes available). If the title is unchanged we leave it
// alone - no point nagging the admin about a notice they have already read.
export async function upsertAlert({ type, dedupeKey, title, link }: UpsertAlert): Promise<void> {
  const existing = await prisma.notification.findFirst({ where: { dedupeKey } })

  if (!existing) {
    await prisma.notification.create({
      data: { type, dedupeKey, title, link, readAt: null },
    })
    return
  }

  if (existing.title !== title || existing.link !== link) {
    await prisma.notification.update({
      where: { id: existing.id },
      data: { title, link, readAt: null, updatedAt: new Date() },
    })
  }
}

export async function clearAlert(dedupeKey: string): Promise<void> {
  await prisma.notification.deleteMany({ where: { dedupeKey } })
}

// ---------------------------------------------------------------------------
// Thin wrappers used by the on-demand update checks
// ---------------------------------------------------------------------------

export async function recordCoreUpdate(latestVersion: string): Promise<void> {
  await upsertAlert({
    type: 'core_update',
    dedupeKey: 'core-update',
    title: `Cactus update available - v${latestVersion}`,
    link: '/config?tab=general',
  })
}

export async function recordModuleUpdate({
  moduleId,
  name,
  latestVersion,
}: {
  moduleId: string
  name: string
  latestVersion: string
}): Promise<void> {
  await upsertAlert({
    type: 'module_update',
    dedupeKey: `module-update:${moduleId}`,
    title: `Update available for ${name} - v${latestVersion}`,
    link: '/modules',
  })
}
