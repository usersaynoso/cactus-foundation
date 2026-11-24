import { NextResponse } from 'next/server'
import { getMemberFromCookie } from '@/lib/members/session'
import { getMembersConfig, isAccountSectionEnabled } from '@/lib/members/config'
import { findLinkedAdminForMember, listAdminPasskeys } from '@/lib/members/admin-passkey-manage'

// The signed-in member's admin passkeys, when they are the admin behind this
// member account and the site allows the link (lib/members/admin-passkey-
// manage.ts). Everyone else gets `linked: false` and nothing else - the answer
// does not say whether some admin holds the address.
export async function GET() {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const config = await getMembersConfig()
  if (!isAccountSectionEnabled(config, 'security')) return NextResponse.json({ linked: false, passkeys: [] })

  const admin = await findLinkedAdminForMember(member, config)
  if (!admin) return NextResponse.json({ linked: false, passkeys: [] })

  return NextResponse.json({ linked: true, passkeys: await listAdminPasskeys(admin.id) })
}
