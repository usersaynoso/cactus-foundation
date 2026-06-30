import { prisma } from '@/lib/db/prisma'

type Reason = { label: string; detail?: string; at: string }

export async function recordDeploymentNeeded(reason: { label: string; detail?: string }) {
  const open = await prisma.notification.findFirst({
    where: { type: 'deployment', deployInitiatedAt: null },
    orderBy: { createdAt: 'desc' },
  })

  const newReason: Reason = { ...reason, at: new Date().toISOString() }

  if (open) {
    const existing = (open.reasons as Reason[] | null) ?? []
    // Dedupe by label - replace existing entry with same label, append new one
    const updated = [...existing.filter((r) => r.label !== reason.label), newReason]
    await prisma.notification.update({
      where: { id: open.id },
      data: {
        reasons: updated,
        // Re-surface if the admin had read it but not yet deployed
        readAt: null,
        updatedAt: new Date(),
      },
    })
  } else {
    await prisma.notification.create({
      data: {
        type: 'deployment',
        title: 'Changes awaiting deployment',
        reasons: [newReason],
      },
    })
  }
}

export async function getUnreadCount(): Promise<number> {
  return prisma.notification.count({ where: { readAt: null } })
}

const EMAIL_KEYS = new Set(['BREVO_API_KEY', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'])
const INTEGRATION_KEYS = new Set([
  'GITHUB_API_TOKEN',
  'ENCRYPTION_KEY',
  'NEON_API_KEY',
  'NEON_PROJECT_ID',
  'EDGE_CONFIG',
  'VERCEL_EDGE_CONFIG_ID',
  'VERCEL_WEBHOOK_SECRET',
  'TURNSTILE_SITE_KEY',
  'TURNSTILE_SECRET_KEY',
  'SENTRY_DSN',
  'NEXT_PUBLIC_SITE_URL',
])

export function labelForEnvKeys(keys: string[]): string {
  if (keys.some((k) => EMAIL_KEYS.has(k))) return 'Email settings updated'
  if (keys.some((k) => INTEGRATION_KEYS.has(k))) return 'Integration keys updated'
  return 'Media storage settings updated'
}
