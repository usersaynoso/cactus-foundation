import { NextResponse } from 'next/server'
import { redirect } from 'next/navigation'
import { getMembersConfig } from '@/lib/members/config'
import { getMemberAreaPath } from '@/lib/members/paths'
import { accountSectionAnchor, type AccountSectionKey } from '@/lib/members/account-layout'

// With the one-page account switched on, a section's own page is no longer
// where that section lives - the overview is. Sending a member who typed the
// address (or followed an old bookmark) to the anchor keeps one copy of the
// truth, rather than two pages that both work and disagree about which tabs
// should be lit.
export async function redirectWhenSinglePage(key: AccountSectionKey): Promise<void> {
  const config = await getMembersConfig()
  if (!config.accountSinglePage) return
  redirect(`/${getMemberAreaPath()}#${accountSectionAnchor(key)}`)
}

// The profile page saves through four separate routes (profile, profile
// visibility, avatar, username). One shared refusal keeps them saying the same
// thing: a member who left the page open before an admin switched the section
// off should get one answer, not four differently-worded failures.
//
// 403 rather than 404: the route exists, the site has simply stopped offering
// it, which is the same shape as the avatarUploadsEnabled refusal next door.
export const PROFILE_SECTION_OFF_MESSAGE = 'The profile page is switched off for this site.'

export function profileSectionOffResponse() {
  return NextResponse.json({ error: PROFILE_SECTION_OFF_MESSAGE }, { status: 403 })
}
