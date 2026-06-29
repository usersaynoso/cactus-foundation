import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { prisma } from '@/lib/db/prisma'
import { encryptSecret } from '@/lib/crypto/secrets'
import path from 'path'
import { readFile } from 'fs/promises'
import sharp from 'sharp'
import { createAppAuth } from '@octokit/auth-app'

type ManifestConversionResponse = {
  id: number
  slug: string
  pem: string
  webhook_secret?: string | null
  client_id?: string | null
  client_secret?: string | null
}

export async function GET(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  const storedState = request.cookies.get('cactus_github_app_state')?.value

  if (!code || !state || !storedState || state !== storedState) {
    const config = await prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: { adminPath: true },
    })
    const adminPath = config?.adminPath ?? ''
    const res = NextResponse.redirect(
      new URL(`/${adminPath}/config?tab=integrations&github=error&reason=state_mismatch`, request.url)
    )
    res.cookies.delete('cactus_github_app_state')
    return res
  }

  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { adminPath: true },
  })
  const adminPath = config?.adminPath ?? ''

  const encKey = process.env.ENCRYPTION_KEY
  if (!encKey) {
    const res = NextResponse.redirect(
      new URL(`/${adminPath}/config?tab=integrations&github=error&reason=encrypt_key_missing`, request.url)
    )
    res.cookies.delete('cactus_github_app_state')
    return res
  }
  if (encKey.length !== 64 || !/^[0-9a-fA-F]+$/.test(encKey)) {
    const res = NextResponse.redirect(
      new URL(`/${adminPath}/config?tab=integrations&github=error&reason=encrypt_key_format`, request.url)
    )
    res.cookies.delete('cactus_github_app_state')
    return res
  }

  let data: ManifestConversionResponse
  try {
    const resp = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(15_000),
    })
    if (!resp.ok) {
      const body = await resp.text()
      console.error('[github/callback] manifest conversion failed:', resp.status, body)
      const res = NextResponse.redirect(
        new URL(`/${adminPath}/config?tab=integrations&github=error&reason=conversion_failed`, request.url)
      )
      res.cookies.delete('cactus_github_app_state')
      return res
    }
    data = (await resp.json()) as ManifestConversionResponse
  } catch (err) {
    console.error('[github/callback] fetch error:', err)
    const res = NextResponse.redirect(
      new URL(`/${adminPath}/config?tab=integrations&github=error&reason=network`, request.url)
    )
    res.cookies.delete('cactus_github_app_state')
    return res
  }

  let privateKeyEncrypted: string
  let webhookSecretEncrypted: string | null
  let clientIdEncrypted: string | null
  let clientSecretEncrypted: string | null

  const encOptional = (v?: string | null) => (v ? encryptSecret(v) : null)

  try {
    privateKeyEncrypted = encryptSecret(data.pem)
    webhookSecretEncrypted = encOptional(data.webhook_secret)
    clientIdEncrypted = encOptional(data.client_id)
    clientSecretEncrypted = encOptional(data.client_secret)
  } catch (err) {
    console.error('[github/callback] encryption error:', err)
    const res = NextResponse.redirect(
      new URL(`/${adminPath}/config?tab=integrations&github=error&reason=encrypt_error`, request.url)
    )
    res.cookies.delete('cactus_github_app_state')
    return res
  }

  try {
    await prisma.githubAppConnection.deleteMany()
    await prisma.githubAppConnection.create({
      data: {
        appId: String(data.id),
        appSlug: data.slug,
        installationId: null,
        installationAccount: null,
        privateKeyEncrypted,
        webhookSecretEncrypted,
        clientIdEncrypted,
        clientSecretEncrypted,
      },
    })
  } catch (err) {
    console.error('[github/callback] db write error:', err)
    const res = NextResponse.redirect(
      new URL(`/${adminPath}/config?tab=integrations&github=error&reason=db`, request.url)
    )
    res.cookies.delete('cactus_github_app_state')
    return res
  }

  // Logo upload — non-fatal; failures only log a warning
  try {
    const svgPath = path.join(process.cwd(), 'public', 'cactus.svg')
    const svgBuffer = await readFile(svgPath)

    // Render the portrait SVG (980x1057) at 2x density then fit into 200x200
    const pngBuffer = await sharp(svgBuffer, { density: 144 })
      .resize(200, 200, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()

    // App-level JWT (not installation token) required by PUT /app/logo
    const auth = createAppAuth({ appId: data.id, privateKey: data.pem })
    const { token } = await auth({ type: 'app' }) as { token: string }

    const logoResp = await fetch('https://api.github.com/app/logo', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'image/png',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: new Blob([new Uint8Array(pngBuffer)]),
      signal: AbortSignal.timeout(15_000),
    })

    if (!logoResp.ok) {
      console.warn('[github/callback] logo upload failed:', logoResp.status, await logoResp.text())
    }
  } catch (err) {
    console.warn('[github/callback] logo upload error (non-fatal):', err)
  }

  const res = NextResponse.redirect(
    new URL(`/${adminPath}/config?tab=integrations&github=connected`, request.url)
  )
  res.cookies.delete('cactus_github_app_state')
  return res
}
