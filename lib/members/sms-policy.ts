import type { MemberTwoFactor } from '@prisma/client'
import type { MembersConfig } from '@/lib/members/config'
import { getActiveSmsProvider } from '@/lib/auth/sms'

// Whether this member still needs to enrol a mobile number under the
// smsTwoFactorPolicy setting. REQUIRED only bites while an SMS provider
// module is active and configured - with no provider there is nothing to
// enrol against, so the policy silently behaves as OPTIONAL.
export async function memberNeedsSmsEnrolment(
  config: MembersConfig,
  twoFactorConfigs: Pick<MemberTwoFactor, 'method' | 'verified' | 'phoneEncrypted'>[]
): Promise<boolean> {
  if (config.smsTwoFactorPolicy !== 'REQUIRED') return false
  const enrolled = twoFactorConfigs.some((c) => c.method === 'SMS' && c.verified && c.phoneEncrypted)
  if (enrolled) return false
  return (await getActiveSmsProvider()) !== null
}
