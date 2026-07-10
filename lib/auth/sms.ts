// SMS delivery for login codes, backed by module-contributed providers.
// Modules declare providers via the manifest's `smsProviders` field; the
// generated registry (lib/modules/sms-providers.ts) holds the static imports.
// Core only ever talks to the SmsProvider interface — no provider-specific
// code lives here.
import { prisma } from '@/lib/db/prisma'
import { moduleSmsProviders } from '@/lib/modules/sms-providers'

export type SmsProvider = {
  isConfigured(): boolean | Promise<boolean>
  sendSms(to: string, body: string): Promise<void>
}

// Returns the first configured SMS provider contributed by an active module,
// or null when none is available. Callers must always handle null — SMS login
// codes silently fall back to email delivery when the provider goes away
// (module uninstalled or credentials removed), so nobody gets locked out.
export async function getActiveSmsProvider(): Promise<SmsProvider | null> {
  if (moduleSmsProviders.length === 0) return null

  const active = await prisma.module.findMany({
    where: { status: { in: ['active', 'update_available'] } },
    select: { name: true },
  })
  const activeNames = new Set(active.map((m) => m.name))

  for (const entry of moduleSmsProviders) {
    if (!activeNames.has(entry.module)) continue
    try {
      const provider = entry.provider as SmsProvider
      if (await provider.isConfigured()) return provider
    } catch {
      // A broken provider must never take login down — skip it.
      continue
    }
  }
  return null
}

export async function sendLoginCodeSms(
  provider: SmsProvider,
  to: string,
  code: string,
  siteName: string
): Promise<void> {
  await provider.sendSms(to, `${code} is your ${siteName} login code. It expires in 10 minutes.`)
}

// "+447700900123" -> "•••• 0123" — enough for the owner to recognise the
// number without leaking it to whoever typed the right password.
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return `•••• ${digits.slice(-4)}`
}
