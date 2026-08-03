import { NextResponse } from 'next/server'
import { getMemberFromCookie } from '@/lib/members/session'
import { requestMemberDeletion } from '@/lib/members/deletion'

export async function POST() {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  // An admin-linked account is the member half of a staff account, and the
  // staff half would simply mint another one on the next visit. Deleting it
  // here would look like it worked and then quietly undo itself, so the honest
  // answer is to send them where the deletion actually happens.
  if (member.userId) {
    return NextResponse.json(
      {
        error:
          'This account belongs to your admin sign-in, so it cannot be deleted from here. Remove the admin account instead.',
      },
      { status: 403 }
    )
  }

  const scheduledAt = await requestMemberDeletion(member.id)
  return NextResponse.json({ scheduledAt })
}
