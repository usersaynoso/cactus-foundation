import { NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { listVideoJobs } from '@/lib/media/video-jobs'

// Live list of video-optimise jobs and their statuses for the Media > Video
// panel. The rows are the job notifications themselves, so this only reports -
// clearing a job's row goes through the normal notifications delete.

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await hasPermission(user, 'media.upload'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const jobs = await listVideoJobs()
  return NextResponse.json({ jobs })
}
