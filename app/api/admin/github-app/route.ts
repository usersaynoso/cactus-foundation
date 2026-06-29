import { NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { prisma } from '@/lib/db/prisma'
import { errorResponse } from '@/lib/utils'

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)

  const encryptionKeySet = !!process.env.ENCRYPTION_KEY
  const hasPat = !!process.env.GITHUB_API_TOKEN

  let connected = false
  let appSlug: string | null = null
  let installationAccount: string | null = null
  let hasInstallation = false

  if (encryptionKeySet) {
    try {
      const conn = await prisma.githubAppConnection.findFirst()
      if (conn) {
        connected = true
        appSlug = conn.appSlug
        installationAccount = conn.installationAccount
        hasInstallation = !!conn.installationId
      }
    } catch {
      // DB not reachable — return defaults
    }
  }

  return NextResponse.json({
    encryptionKeySet,
    connected,
    appSlug,
    installationAccount,
    hasInstallation,
    hasPat,
  })
}
