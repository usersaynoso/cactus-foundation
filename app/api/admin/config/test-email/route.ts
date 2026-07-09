import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { sendTestEmail, sendTestEmailWithCredentials } from '@/lib/email'

const Body = z.object({
  to: z.string().email().optional(),
  // Unsaved credentials typed into the settings form — lets an admin verify
  // them before saving triggers a redeploy. Blank fields fall back to the
  // values already in the server environment.
  credentials: z
    .object({
      provider: z.enum(['brevo', 'smtp']),
      brevoApiKey: z.string().max(500).optional(),
      smtpHost: z.string().max(500).optional(),
      smtpPort: z.string().max(10).optional(),
      smtpUser: z.string().max(500).optional(),
      smtpPass: z.string().max(500).optional(),
    })
    .optional(),
})

export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'config.manage')) return errorResponse('Forbidden', 403)

  const parsed = Body.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input')

  const to = parsed.data.to || user.email
  if (!to) return errorResponse('No recipient email address available')

  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { siteName: true },
  })

  try {
    const siteName = config?.siteName ?? 'Cactus Foundation'
    if (parsed.data.credentials) {
      await sendTestEmailWithCredentials(to, siteName, parsed.data.credentials)
    } else {
      await sendTestEmail(to, siteName)
    }
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to send test email', 502)
  }

  return NextResponse.json({ ok: true, to })
}
