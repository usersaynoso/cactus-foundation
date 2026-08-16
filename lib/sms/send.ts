import { getActiveSmsProvider } from '@/lib/auth/sms'
import { renderSmsTemplate } from '@/lib/sms/render'

// Sending half of the text-message registry. Transport is whichever module has
// contributed a configured SMS provider (lib/auth/sms.ts) - core knows nothing
// about Twilio or anyone else, and everything here answers "no" rather than
// throwing when no provider is available, because a site with texts switched
// off must keep working exactly as it did.

/** Whether the site can send a text message at all right now: a module with an
 * SMS provider is installed, active, and has been given a number to send from.
 * The answer changes when an owner configures or removes one, so callers ask
 * per request rather than caching it. */
export async function isSmsAvailable(): Promise<boolean> {
  return !!(await getActiveSmsProvider())
}

/** E.164, which is the only shape every provider agrees on. */
const E164 = /^\+[1-9]\d{7,14}$/

/**
 * "07700 900123" -> "+447700900123". A number typed into a shop checkout is
 * whatever the shopper felt like typing, and a national number needs a country
 * to make sense of it - so the default dialling code comes from the caller
 * (the shop passes its own store country), and anything that still cannot be
 * resolved is returned as null rather than guessed at.
 */
export function normaliseSmsNumber(raw: string | null | undefined, defaultCallingCode = '44'): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  // 00 is the other way of writing +, and plenty of people do.
  const withPlus = trimmed.startsWith('00') ? `+${trimmed.slice(2)}` : trimmed
  const digits = withPlus.replace(/[^\d+]/g, '')

  if (digits.startsWith('+')) return E164.test(digits) ? digits : null

  // A national number: drop the trunk zero and prepend the dialling code.
  const national = digits.replace(/^0+/, '')
  if (!national) return null
  const candidate = `+${defaultCallingCode}${national}`
  return E164.test(candidate) ? candidate : null
}

export type SmsSendResult = { sent: boolean; reason?: 'no-provider' | 'no-number' | 'switched-off' | 'failed' }

/**
 * Renders a registered template and sends it. Never throws: a notification
 * that cannot go out must not take down the order, the status change or the
 * dispatch that raised it, so a failure is logged and reported in the result.
 */
export async function sendSmsTemplate(
  to: string | null | undefined,
  key: string,
  vars: Record<string, string> = {},
  opts?: { defaultCallingCode?: string },
): Promise<SmsSendResult> {
  const number = normaliseSmsNumber(to, opts?.defaultCallingCode)
  if (!number) return { sent: false, reason: 'no-number' }

  const provider = await getActiveSmsProvider()
  if (!provider) return { sent: false, reason: 'no-provider' }

  let body: string | null
  try {
    body = await renderSmsTemplate(key, vars)
  } catch (err) {
    console.error('[sms] could not render template', key, err)
    return { sent: false, reason: 'failed' }
  }
  if (!body) return { sent: false, reason: 'switched-off' }

  try {
    await provider.sendSms(number, body)
    return { sent: true }
  } catch (err) {
    console.error('[sms] failed to send', key, err)
    return { sent: false, reason: 'failed' }
  }
}
