import { Prisma, type NotificationType } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'

// Generic on-demand alert helpers. Unlike deployment notifications (which append
// reasons to one open record), alerts are keyed by a stable dedupeKey so the same
// concern only ever holds a single notification: core-update (one ever),
// module-update:{moduleId} (one per module), contact-form:messages (one rolling).

type UpsertAlert = {
  type: NotificationType
  dedupeKey: string
  title: string
  link: string
  reasons?: unknown
}

// Create the alert if none exists; re-surface (mark unread) when the title changes
// so a notice only re-lights the bell when the underlying state actually changes
// (e.g. a newer version becomes available). If the title is unchanged we leave it
// alone - no point nagging the admin about a notice they have already read.
export async function upsertAlert({ type, dedupeKey, title, link, reasons }: UpsertAlert): Promise<void> {
  const existing = await prisma.notification.findFirst({ where: { dedupeKey } })
  const jsonReasons =
    reasons === undefined ? undefined : reasons === null ? Prisma.DbNull : (reasons as Prisma.InputJsonValue)

  if (!existing) {
    await prisma.notification.create({
      data: { type, dedupeKey, title, link, reasons: jsonReasons, readAt: null },
    })
    return
  }

  if (existing.title !== title || existing.link !== link || JSON.stringify(existing.reasons ?? null) !== JSON.stringify(reasons ?? null)) {
    await prisma.notification.update({
      where: { id: existing.id },
      data: { title, link, reasons: jsonReasons, readAt: null, updatedAt: new Date() },
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

export type NotificationReason = { label: string; detail?: string; at: string }

function sequenceNotificationTitle(name: string, state: 'queued' | 'running' | 'done' | 'error'): string {
  if (state === 'done') return `Scroll sequence complete: ${name}`
  if (state === 'error') return `Scroll sequence failed: ${name}`
  return `Scroll sequence in progress: ${name}`
}

export async function upsertSequenceNotification({
  jobId,
  name,
  state,
  progress,
  detail,
}: {
  jobId: string
  name: string
  state: 'queued' | 'running' | 'done' | 'error'
  progress?: number
  detail?: string
}): Promise<void> {
  const pct = typeof progress === 'number' && Number.isFinite(progress) ? Math.max(0, Math.min(100, Math.round(progress))) : null
  const reasons: NotificationReason[] = [
    {
      label: state === 'queued' ? 'Queued' : state === 'running' ? 'Building' : state === 'done' ? 'Finished' : 'Failed',
      detail: pct === null ? detail : detail ? `${pct}% - ${detail}` : `${pct}%`,
      at: new Date().toISOString(),
    },
  ]

  await upsertAlert({
    type: 'message',
    dedupeKey: `sequence-job:${jobId}`,
    title: sequenceNotificationTitle(name, state),
    link: '/media',
    reasons,
  })
}
