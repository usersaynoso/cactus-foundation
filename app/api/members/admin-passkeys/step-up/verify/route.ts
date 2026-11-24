import { NextRequest, NextResponse } from 'next/server'
import { getMemberFromCookie } from '@/lib/members/session'
import { getMembersConfig, isAccountSectionEnabled } from '@/lib/members/config'
import { findLinkedAdminForMember, verifyAdminStepUp } from '@/lib/members/admin-passkey-manage'
import { checkAndRecord, getClientIp } from '@/lib/auth/rate-limit'

// Second half: checks the admin passkey and, if it is good, grants one change
// to admin passkeys within the next few minutes.
export async function POST(request: NextRequest) {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const ip = await getClientIp(request)
  const rl = await checkAndRecord('member_admin_stepup', [`ip:${ip}`, `account:${member.id}`])
  if (!rl.allowed) return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })

  const config = await getMembersConfig()
  const admin = isAccountSectionEnabled(config, 'security') ? await findLinkedAdminForMember(member, config) : null
  if (!admin) return NextResponse.json({ error: 'Not available for this account' }, { status: 403 })

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const ok = await verifyAdminStepUp(member.id, admin.id, body)
  if (!ok) return NextResponse.json({ error: 'That passkey could not be confirmed. Try again.' }, { status: 403 })
  return NextResponse.json({ ok: true })
}
