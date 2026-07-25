import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { getSequenceJob, SequenceWorkerError } from '@/lib/media/sequence'

// Progress poll for a running conversion. Proxies the worker's GET /jobs/{id} so
// the shared worker secret never reaches the browser. The finished library row is
// created by the callback, so this only reports status/progress for the UI.
export async function GET(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!(await hasPermission(user, 'media.upload'))) return errorResponse('Forbidden', 403)

  const jobId = request.nextUrl.searchParams.get('jobId') ?? ''
  if (!jobId) return errorResponse('jobId is required', 400)

  try {
    const job = await getSequenceJob(jobId)
    return NextResponse.json({ status: job.status, progress: job.progress, error: job.error ?? null })
  } catch (err) {
    if (err instanceof SequenceWorkerError) return errorResponse(err.message, 502)
    throw err
  }
}
