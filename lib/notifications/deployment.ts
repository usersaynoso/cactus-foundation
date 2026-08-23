import { prisma } from '@/lib/db/prisma'
import { ALL_PROVIDERS, envKeysForProvider, ALL_CLOUDFLARE_CREDENTIAL_KEYS } from '@/lib/media/providers'
import { formatModuleDisplayName } from '@/lib/modules/manifest'
import { INSTALLED_MODULE_STATUSES } from '@/lib/modules/live-status'

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
const PAYMENT_KEYS = new Set(['STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY', 'STRIPE_WEBHOOK_SECRET', 'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_WEBHOOK_ID', 'PAYPAL_MODE'])
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

// Spelled out rather than left to the fallback, which is what it used to be.
// See labelForEnvKeys.
const MEDIA_KEYS = new Set<string>([
  ...ALL_PROVIDERS.flatMap(envKeysForProvider),
  ...ALL_CLOUDFLARE_CREDENTIAL_KEYS,
])

// Which installed module declared any of these keys, by the same display name
// its card carries on the Modules page - so "go and deploy the thing you just
// saved" names something the admin can actually go and look at.
//
// Deliberately failure-tolerant: this only decides the wording of a notice, and
// a notification that does not get written is a deployment nobody is told about.
async function moduleClaimingEnvKeys(keys: string[]): Promise<string | null> {
  try {
    const mods = await prisma.module.findMany({
      // Same widened set as the env route's own getManagedKeys: a switched-off
      // module's variables stay editable, so its saves still deserve its name.
      where: { status: { in: [...INSTALLED_MODULE_STATUSES, 'inactive'] } },
      select: { repoUrl: true, manifest: true },
    })
    for (const mod of mods) {
      const manifest = mod.manifest as { requiredEnvVars?: Array<{ name?: string }> } | null
      const declared = new Set((manifest?.requiredEnvVars ?? []).map((v) => v.name).filter(Boolean))
      if (keys.some((k) => declared.has(k))) return formatModuleDisplayName(mod.repoUrl)
    }
  } catch {
    // No database, or a repoUrl that will not parse. Fall through to the
    // generic wording rather than losing the notification altogether.
  }
  return null
}

// The one line an admin reads on "Changes awaiting deployment". It has to name
// what they just saved, because recordDeploymentNeeded dedupes by this string:
// two saves that produce the same label collapse into one entry, and the second
// one silently REPLACES the first rather than adding a line of its own.
//
// Which is exactly what went wrong. Every key a module declared - Square's,
// GoCardless's, Twilio's, the lot - fell past these four sets into a hardcoded
// "Media storage settings updated". So saving a Square credential re-surfaced
// an existing media entry with its text unchanged, and the admin was told to
// deploy for a reason that had nothing to do with what they had done. Media now
// has a set of its own, module keys resolve to the module that declared them,
// and the last resort says nothing it cannot stand behind.
export async function labelForEnvKeys(keys: string[]): Promise<string> {
  if (keys.some((k) => EMAIL_KEYS.has(k))) return 'Email settings updated'
  if (keys.some((k) => PAYMENT_KEYS.has(k))) return 'Payment provider keys updated'
  if (keys.some((k) => INTEGRATION_KEYS.has(k))) return 'Integration keys updated'
  if (keys.some((k) => MEDIA_KEYS.has(k))) return 'Media storage settings updated'
  const moduleName = await moduleClaimingEnvKeys(keys)
  return moduleName ? `${moduleName} settings updated` : 'Site settings updated'
}
