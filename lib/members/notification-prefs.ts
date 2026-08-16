import { prisma } from '@/lib/db/prisma'
import { getModuleNotificationCategories } from '@/lib/modules/member-extensions'

// How a member has asked to be told about one category, resolved across both
// channels at once. Absence of a row is the default rather than "off", and the
// two channels default differently on purpose: email is what an account is made
// of, a text message costs the owner money and goes to a number somebody has to
// have handed over, so it is opt-in.
//
// Modules read this rather than the preference rows directly, so the defaults
// live in one place.

export type MemberChannelPreference = { email: boolean; sms: boolean }

export const DEFAULT_CHANNEL_PREFERENCE: MemberChannelPreference = { email: true, sms: false }

export async function getMemberChannelPreference(memberId: string, category: string): Promise<MemberChannelPreference> {
  const rows = await prisma.memberNotificationPreference
    .findMany({ where: { memberId, category }, select: { channel: true, enabled: true } })
    .catch(() => [])

  const pref = { ...DEFAULT_CHANNEL_PREFERENCE }
  for (const row of rows) {
    if (row.channel === 'EMAIL') pref.email = row.enabled
    if (row.channel === 'SMS') pref.sms = row.enabled
  }
  return pref
}

/** Whether a category may be switched off entirely, per the module that
 * declared it. A required category always keeps at least one channel on. */
export async function isRequiredNotificationCategory(category: string): Promise<boolean> {
  const categories = await getModuleNotificationCategories()
  return categories.find((c) => c.category === category)?.required ?? false
}
