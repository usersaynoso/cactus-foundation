import { NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { prisma } from '@/lib/db/prisma'
import { errorResponse } from '@/lib/utils'

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)

  const key = process.env.ENCRYPTION_KEY ?? ''
  const encryptionKeySet = key.length > 0
  const encryptionKeyValid = key.length === 64 && /^[0-9a-fA-F]+$/.test(key)
  const hasPat = !!process.env.GITHUB_API_TOKEN

  let connected = false
  let appSlug: string | null = null
  let installationAccount: string | null = null
  let hasInstallation = false

  if (encryptionKeyValid) {
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
    encryptionKeyValid,
    connected,
    appSlug,
    installationAccount,
    hasInstallation,
    hasPat,
  })
}
