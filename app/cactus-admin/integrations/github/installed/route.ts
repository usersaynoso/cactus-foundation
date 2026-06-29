import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { prisma } from '@/lib/db/prisma'
import { decryptSecret } from '@/lib/crypto/secrets'
import { getAppOctokit } from '@/lib/github/client'

export async function GET(request: NextRequest) {
  const user = await getSessionFromCookie()
  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { adminPath: true },
  })
  const adminPath = config?.adminPath ?? ''

  if (!user) {
    return NextResponse.redirect(
      new URL(`/${adminPath}/login?next=/${adminPath}/config?tab=integrations`, request.url)
    )
  }

  const { searchParams } = request.nextUrl
  const installationId = searchParams.get('installation_id')
  const state = searchParams.get('state')
  const storedState = request.cookies.get('cactus_github_app_state')?.value

  const conn = await prisma.githubAppConnection.findFirst()

  if (!installationId || !conn) {
    const res = NextResponse.redirect(
      new URL(`/${adminPath}/config?tab=integrations&github=error&reason=missing_installation`, request.url)
    )
    res.cookies.delete('cactus_github_app_state')
    return res
  }

  // Validate state only if we have a stored state (it may have expired)
  if (storedState && state && state !== storedState) {
    const res = NextResponse.redirect(
      new URL(`/${adminPath}/config?tab=integrations&github=error&reason=state_mismatch`, request.url)
    )
    res.cookies.delete('cactus_github_app_state')
    return res
  }

  let installationAccount: string | null = null
  try {
    const privateKey = decryptSecret(conn.privateKeyEncrypted)
    const octokit = getAppOctokit(conn.appId, privateKey)
    const { data } = await octokit.rest.apps.getInstallation({
      installation_id: parseInt(installationId, 10),
    })
    installationAccount = data.account && 'login' in data.account ? data.account.login : null
  } catch (err) {
    console.error('[github/installed] failed to fetch installation account:', err)
    // Non-fatal — still store the installationId
  }

  try {
    await prisma.githubAppConnection.update({
      where: { id: conn.id },
      data: {
        installationId,
        installationAccount,
      },
    })
  } catch (err) {
    console.error('[github/installed] db update error:', err)
    const res = NextResponse.redirect(
      new URL(`/${adminPath}/config?tab=integrations&github=error&reason=db`, request.url)
    )
    res.cookies.delete('cactus_github_app_state')
    return res
  }

  const res = NextResponse.redirect(
    new URL(`/${adminPath}/config?tab=integrations&github=installed`, request.url)
  )
  res.cookies.delete('cactus_github_app_state')
  return res
}
