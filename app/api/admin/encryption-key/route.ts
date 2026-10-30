import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionFromCookie } from '@/lib/auth/session'
import { confirmStepUp } from '@/lib/auth/step-up'
import { isAdmin } from '@/lib/permissions/check'
import { prisma } from '@/lib/db/prisma'
import { errorResponse } from '@/lib/utils'
import { isLocalMode } from '@/lib/config/env'
import { getHostingCredentials, missingCredentialsMessage } from '@/lib/hosting/provider'
import { deleteHostEnvVars, upsertHostEnvVars } from '@/lib/hosting/env'
import { hostDashboardRedeployHint, triggerRedeploy } from '@/lib/hosting/deploy'
import { invalidateSiteConfigCache } from '@/lib/config/site'
import { clearUnreadableSecrets } from '@/lib/backup/secrets'
import {
  ENCRYPTION_KEY_NEXT_VAR,
  ENCRYPTION_KEY_VAR,
  envKeys,
  isWellFormedKey,
  keyFingerprint,
  ringFingerprints,
} from '@/lib/crypto/keyring'
import { loadKeyring } from '@/lib/crypto/keyring-loader'
import { dryRunRotation, rollbackLatestRotation, rotateEncryptionKey, RotationBlockedError } from '@/lib/crypto/rotation'
import { rotationStatus, type RotationRecord } from '@/lib/crypto/rotation-status'
import { modulesReadingEncryptionKeyDirectly } from '@/lib/modules/encryption-key-readers'

// Settings -> Encryption key. Drives the rotation in lib/crypto/rotation.ts, one
// step per action, each refusing unless the site is in the state it needs:
//
//   stage    owner's new key -> ENCRYPTION_KEY_NEXT on the host, redeploy   (S0 -> S1)
//   dry-run  count and prove every stored secret; changes nothing
//   clear    clear the values no key can read (password)                   unblocks
//   rotate   re-encrypt everything under NEXT (password)                   (S1 -> S2)
//   rollback put it back while the old key is still ENCRYPTION_KEY (password)
//   finish   NEXT -> ENCRYPTION_KEY, remove NEXT, redeploy                 (S2 -> S3)
//   cancel   withdraw a staged key before anything is under it
//
// The new key is only ever written to the host - never read back from it, which
// Vercel's sensitive variables would refuse - and the old one never leaves this
// deployment's memory except into the history table, encrypted under the new.
//
// Superadmins only. Sessions and sign-in are untouched throughout: they hang off
// SESSION_SECRET, not this key.

export const maxDuration = 120

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('stage'), key: z.string() }),
  z.object({ action: z.literal('dry-run') }),
  z.object({ action: z.literal('clear-unreadable'), password: z.string().optional() }),
  z.object({ action: z.literal('rotate'), password: z.string().optional() }),
  z.object({ action: z.literal('rollback'), password: z.string().optional() }),
  z.object({ action: z.literal('finish') }),
  z.object({ action: z.literal('cancel') }),
])

async function readRecord(): Promise<RotationRecord> {
  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: {
      encryptionKeyActiveFingerprint: true,
      encryptionKeyStagedFingerprint: true,
      encryptionKeySwapRequestedAt: true,
    },
  })
  return {
    activeFingerprint: config?.encryptionKeyActiveFingerprint ?? null,
    stagedFingerprint: config?.encryptionKeyStagedFingerprint ?? null,
    swapRequestedAt: config?.encryptionKeySwapRequestedAt ?? null,
  }
}

async function writeRecord(data: {
  encryptionKeyStagedFingerprint?: string | null
  encryptionKeySwapRequestedAt?: Date | null
}): Promise<void> {
  await prisma.siteConfig.update({ where: { id: 'singleton' }, data })
  invalidateSiteConfigCache()
}

async function currentStatus() {
  const record = await readRecord()
  const status = rotationStatus(record)
  if (status.settle) {
    await writeRecord({ encryptionKeyStagedFingerprint: null, encryptionKeySwapRequestedAt: null })
  }
  const lastRotation = await prisma.encryptionKeyRotation.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, counts: true, rolledBackAt: true },
  })
  const creds = isLocalMode() ? null : getHostingCredentials()
  return {
    ...status,
    stagedFingerprint: status.settle ? null : record.stagedFingerprint,
    activeFingerprint: record.activeFingerprint,
    previousKeys: await prisma.encryptionKey.count(),
    modulesReadingKeyDirectly: modulesReadingEncryptionKeyDirectly.map((m) => m.module),
    localMode: isLocalMode(),
    canWriteHost: !!creds,
    redeployHint: creds ? hostDashboardRedeployHint(creds.provider) : null,
    lastRotation,
  }
}

// Writes go to the host; a redeploy carries them to the site. Where Cactus cannot
// do that itself (local mode, no hosting credentials) the owner is told exactly
// what to set instead, and the screen waits for the state to change.
async function writeHostAndRedeploy(
  writes: Array<{ key: string; value: string }>,
  removals: string[],
): Promise<{ hostWritten: boolean; redeployed: boolean; message: string | null }> {
  if (isLocalMode()) return { hostWritten: false, redeployed: false, message: null }
  const creds = getHostingCredentials()
  if (!creds) return { hostWritten: false, redeployed: false, message: missingCredentialsMessage() }
  await upsertHostEnvVars(creds, writes.map((w) => ({ ...w, secret: true })))
  if (removals.length > 0) await deleteHostEnvVars(creds, removals)
  const redeploy = await triggerRedeploy(creds).catch((err: unknown) => ({
    triggered: false,
    error: err instanceof Error ? err.message : 'Unknown error',
  }))
  return {
    hostWritten: true,
    redeployed: redeploy.triggered,
    message: redeploy.triggered ? null : `Saved, but the redeploy did not start. ${hostDashboardRedeployHint(creds.provider)}`,
  }
}

function blockingModulesMessage(): string | null {
  const modules = modulesReadingEncryptionKeyDirectly.map((m) => m.module)
  if (modules.length === 0) return null
  return `Not yet: ${modules.join(', ')} still ${modules.length === 1 ? 'reads' : 'read'} the key the old way, so ${modules.length === 1 ? 'its' : 'their'} links would break at the swap. Update ${modules.length === 1 ? 'it' : 'them'} first.`
}

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!isAdmin(user)) return errorResponse('Forbidden', 403)
  return NextResponse.json(await currentStatus())
}

export async function POST(req: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!isAdmin(user)) return errorResponse('Forbidden', 403)

  let parsed: z.infer<typeof Body>
  try {
    parsed = Body.parse(await req.json())
  } catch {
    return errorResponse('Invalid request', 400)
  }

  const record = await readRecord()
  const { phase } = rotationStatus(record)

  try {
    switch (parsed.action) {
      case 'stage': {
        if (phase !== 'idle' && phase !== 'staged') {
          return errorResponse('A rotation is already part-way through. Finish or cancel it first.', 409)
        }
        const key = parsed.key.trim()
        if (!isWellFormedKey(key)) {
          return errorResponse('A key is exactly 64 characters, each 0-9 or a-f. That one is not.', 400)
        }
        if (ringFingerprints().has(keyFingerprint(key))) {
          return errorResponse('That is one of this site\'s own keys already, current or past. Use a new one.', 400)
        }
        const host = await writeHostAndRedeploy([{ key: ENCRYPTION_KEY_NEXT_VAR, value: key }], [])
        await writeRecord({ encryptionKeyStagedFingerprint: keyFingerprint(key), encryptionKeySwapRequestedAt: null })
        return NextResponse.json({ ok: true, ...host, status: await currentStatus() })
      }

      case 'dry-run': {
        const report = await dryRunRotation(prisma, phase === 'ready' ? envKeys().next : null)
        return NextResponse.json({ ok: true, report })
      }

      case 'clear-unreadable': {
        const step = await confirmStepUp(user, parsed.password)
        if (!step.ok) return errorResponse(step.error, step.status)
        const result = await prisma.$transaction((tx) => clearUnreadableSecrets(tx), { timeout: 60_000 })
        return NextResponse.json({ ok: true, cleared: result.cleared })
      }

      case 'rotate': {
        if (phase !== 'ready' && phase !== 'rotated') {
          return errorResponse('The new key has not reached this deployment yet. Wait for the redeploy to finish, then refresh.', 409)
        }
        const blocked = blockingModulesMessage()
        if (blocked) return errorResponse(blocked, 409)
        const step = await confirmStepUp(user, parsed.password)
        if (!step.ok) return errorResponse(step.error, step.status)
        const next = envKeys().next
        if (!next) return errorResponse('The new key is not on this deployment.', 409)
        const dry = await dryRunRotation(prisma, next)
        if (dry.unreadable > 0) {
          return errorResponse(
            `Some stored values cannot be read with any key this site holds (${dry.unreadableAreas.join(', ')}). Clear them first.`,
            409,
          )
        }
        const result = await rotateEncryptionKey(prisma, next)
        await loadKeyring()
        return NextResponse.json({ ok: true, result, status: await currentStatus() })
      }

      case 'rollback': {
        if (phase !== 'rotated') return errorResponse('There is nothing to put back right now.', 409)
        const step = await confirmStepUp(user, parsed.password)
        if (!step.ok) return errorResponse(step.error, step.status)
        const result = await rollbackLatestRotation(prisma)
        await loadKeyring()
        return NextResponse.json({ ok: true, result, status: await currentStatus() })
      }

      case 'finish': {
        if (phase !== 'rotated') return errorResponse('The rotation has not run yet, so there is nothing to swap in.', 409)
        const next = envKeys().next
        if (!next) return errorResponse('The new key is not on this deployment.', 409)
        // KEY first, then remove NEXT: if the second write fails, KEY and NEXT are
        // the same key and nothing is any the worse.
        const host = await writeHostAndRedeploy([{ key: ENCRYPTION_KEY_VAR, value: next }], [ENCRYPTION_KEY_NEXT_VAR])
        if (host.hostWritten) await writeRecord({ encryptionKeySwapRequestedAt: new Date() })
        return NextResponse.json({ ok: true, ...host, status: await currentStatus() })
      }

      case 'cancel': {
        if (phase !== 'staged' && phase !== 'ready') {
          return errorResponse('Only a key that has been staged and not yet used can be withdrawn.', 409)
        }
        const host = await writeHostAndRedeploy([], [ENCRYPTION_KEY_NEXT_VAR])
        await writeRecord({ encryptionKeyStagedFingerprint: null, encryptionKeySwapRequestedAt: null })
        return NextResponse.json({ ok: true, ...host, status: await currentStatus() })
      }
    }
  } catch (err) {
    if (err instanceof RotationBlockedError) return errorResponse(err.message, 409)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return errorResponse(`That did not work: ${message}`, 500)
  }
}
