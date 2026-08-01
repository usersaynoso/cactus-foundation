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
  // Where the notification's button goes. `null` means the notification has no
  // button at all (nothing useful to open yet); omitting it leaves an existing
  // notification's link and label exactly as they are.
  link?: string | null
  // Label for the link button; omitted = the bell's per-type default.
  actionLabel?: string | null
  reasons?: unknown
  // Progress-style alerts rewrite themselves every few seconds. Set this so only a
  // real change of state (a new title) re-lights the bell, rather than every tick
  // marking a read notification unread again.
  resurfaceOnTitleChangeOnly?: boolean
}

// Create the alert if none exists; re-surface (mark unread) when the title changes
// so a notice only re-lights the bell when the underlying state actually changes
// (e.g. a newer version becomes available). If the title is unchanged we leave it
// alone - no point nagging the admin about a notice they have already read.
export async function upsertAlert({
  type,
  dedupeKey,
  title,
  link,
  actionLabel,
  reasons,
  resurfaceOnTitleChangeOnly,
}: UpsertAlert): Promise<void> {
  const existing = await prisma.notification.findFirst({ where: { dedupeKey } })
  const jsonReasons =
    reasons === undefined ? undefined : reasons === null ? Prisma.DbNull : (reasons as Prisma.InputJsonValue)

  if (!existing) {
    await prisma.notification.create({
      data: { type, dedupeKey, title, link: link ?? null, actionLabel: actionLabel ?? null, reasons: jsonReasons, readAt: null },
    })
    return
  }

  // An omitted link/label means "leave whatever is already there" - so a progress
  // tick that knows nothing about the destination can never wipe out a button an
  // earlier, better-informed write put on.
  const nextLink = link === undefined ? existing.link : link
  const nextActionLabel = actionLabel === undefined ? existing.actionLabel : actionLabel

  if (
    existing.title !== title ||
    existing.link !== nextLink ||
    existing.actionLabel !== nextActionLabel ||
    JSON.stringify(existing.reasons ?? null) !== JSON.stringify(reasons ?? null)
  ) {
    const keepRead = resurfaceOnTitleChangeOnly === true && existing.title === title
    await prisma.notification.update({
      where: { id: existing.id },
      data: {
        title,
        link: nextLink,
        actionLabel: nextActionLabel,
        reasons: jsonReasons,
        readAt: keepRead ? existing.readAt : null,
        updatedAt: new Date(),
      },
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
  folderId,
}: {
  jobId: string
  name: string
  state: 'queued' | 'running' | 'done' | 'error'
  /** The worker's own 0-1 fraction, not a percentage. */
  progress?: number
  detail?: string
  // The media folder the finished sequence is filed into, so the completed
  // notification can offer a button straight to it. Omit it (rather than passing
  // null) when the caller doesn't know - null means "the library root".
  folderId?: string | null
}): Promise<void> {
  // The worker reports progress as a 0-1 fraction, so 1 is finished, not 1%.
  const pct =
    typeof progress === 'number' && Number.isFinite(progress)
      ? Math.max(0, Math.min(100, Math.round(progress * 100)))
      : null
  const reasons: NotificationReason[] = [
    {
      label: state === 'queued' ? 'Queued' : state === 'running' ? 'Building' : state === 'done' ? 'Finished' : 'Failed',
      detail: pct === null ? detail : detail ? `${pct}% - ${detail}` : `${pct}%`,
      at: new Date().toISOString(),
    },
  ]

  // Mid-conversion there is nowhere useful to send anyone - the bell shows the
  // live progress bar instead of a button that just reloads the media page. Once
  // the frames have landed, the button opens the folder they were filed into.
  const done = state === 'done'
  const knowsFolder = folderId !== undefined
  const link = done
    ? (knowsFolder ? `/media${folderId ? `?folder=${folderId}` : ''}` : undefined)
    : null

  await upsertAlert({
    type: 'message',
    dedupeKey: `sequence-job:${jobId}`,
    title: sequenceNotificationTitle(name, state),
    link,
    actionLabel: done ? (knowsFolder ? 'Open media folder' : undefined) : null,
    reasons,
    resurfaceOnTitleChangeOnly: true,
  })
}
