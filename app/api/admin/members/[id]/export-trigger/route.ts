import { NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { logMemberAdminAction } from '@/lib/members/admin-log'
import { createDataExportRequest } from '@/lib/members/export'

export const maxDuration = 60

// Triggers a data export on the member's behalf (e.g. to fulfil a support
// request) - same assemble/upload/ready flow as the member's own Danger Zone
// button; the member can download it themselves once it's ready.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await hasPermission(user, 'members.edit'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  try {
    const request = await createDataExportRequest(id)
    await logMemberAdminAction(user, id, 'export_trigger')
    return NextResponse.json({ status: request.status })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Export failed' }, { status: 400 })
  }
}
