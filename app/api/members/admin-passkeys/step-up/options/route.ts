import { NextResponse } from 'next/server'
import { getMemberFromCookie } from '@/lib/members/session'
import { getMembersConfig, isAccountSectionEnabled } from '@/lib/members/config'
import { createAdminStepUpChallenge, findLinkedAdminForMember } from '@/lib/members/admin-passkey-manage'

// First half of "confirm it's you with an admin passkey", asked before any
// change to admin passkeys from the member security page.
export async function POST() {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const config = await getMembersConfig()
  const admin = isAccountSectionEnabled(config, 'security') ? await findLinkedAdminForMember(member, config) : null
  if (!admin) return NextResponse.json({ error: 'Not available for this account' }, { status: 403 })

  const opts = await createAdminStepUpChallenge(member.id, admin.id)
  if (!opts) return NextResponse.json({ error: 'Your admin account has no passkey to confirm with yet' }, { status: 400 })
  return NextResponse.json(opts)
}
