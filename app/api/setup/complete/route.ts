import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/db/prisma'
import { syncToEdgeConfig } from '@/lib/config/edge-config'
import { getSessionFromCookie, createSession, setSessionCookie } from '@/lib/auth/session'
import { refreshStarterLayouts } from '@/lib/setup/starterLayouts'
import { upsertVercelEnvVar } from '@/lib/vercel/env'
import { triggerVercelRedeploy } from '@/lib/vercel/deploy'

export async function POST() {
  const cfg = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { adminPath: true, setupCompleted: true },
  })

  if (cfg?.setupCompleted) {
    const userCount = await prisma.user.count()
    if (userCount > 0) {
      // Allow authenticated admins to refresh starter layout templates
      const session = await getSessionFromCookie().catch(() => null)
      if (!session) {
        return NextResponse.json({ error: 'Setup is already complete' }, { status: 403 })
      }
      await refreshStarterLayouts(prisma)
      return NextResponse.json({ templatesRefreshed: true })
    }
  }

  if (!cfg?.adminPath) {
    return NextResponse.json({ error: 'Admin path not set' }, { status: 400 })
  }

  // Seed a default Home page and Main Menu
  const homePage = await prisma.infoPage.upsert({
    where: { slug: 'home' },
    create: { slug: 'home', title: 'Home', body: '', status: 'published' },
    update: {},
  })

  const mainMenu = await prisma.menu.create({
    data: {
      name: 'Main Menu',
      items: {
        create: { type: 'PAGE', pageId: homePage.id, order: 0, parentId: null },
      },
    },
  })

  // Seed all starter layout templates
  await refreshStarterLayouts(prisma)

  // Default design tokens - new palette format
  const defaultDesignTokens = {
    colours: [
      { name: 'Primary', hex: '#16a34a', darkHex: '#4ade80' },
      { name: 'Surface', hex: '#ffffff', darkHex: '#0f172a' },
    ],
    typography: {
      fontHeading: 'system-ui, sans-serif',
      fontBody: 'system-ui, sans-serif',
      h1Size: '2.5rem',
      h2Size: '1.875rem',
      h3Size: '1.5rem',
      bodySize: '1rem',
      bodyLineHeight: '1.75',
    },
    spacing: { base: 4 },
    radius: {
      small: '2px',
      medium: '6px',
      large: '9999px',
    },
    shadows: {
      subtle: '0 2px 8px rgba(0,0,0,0.08)',
      elevated: '0 4px 24px rgba(0,0,0,0.15)',
    },
  }

  await prisma.siteConfig.update({
    where: { id: 'singleton' },
    data: {
      setupCompleted: true,
      status: 'comingSoon',
      hideFromCrawlers: true,
      homepageId: homePage.id,
      mainMenuId: mainMenu.id,
      designTokens: defaultDesignTokens,
    },
  })

  // Mirror to Edge Config (non-fatal if credentials absent)
  await syncToEdgeConfig({
    adminPath: cfg.adminPath,
    siteStatus: 'comingSoon',
  }).catch(() => {})

  // SESSION_SECRET is generated during the Vercel connect step, but that step is
  // skipped when VERCEL_API_TOKEN is already in the environment before setup.
  // If it's missing, generate it now, write it to Vercel, and trigger a redeploy
  // so the new deployment picks it up. Auto-login is skipped because the current
  // process won't see the new env var until redeployed.
  if (!process.env.SESSION_SECRET || !process.env.ENCRYPTION_KEY) {
    const vercelToken = process.env.VERCEL_API_TOKEN
    const projectId = process.env.VERCEL_PROJECT_ID
    if (vercelToken && projectId) {
      if (!process.env.SESSION_SECRET) {
        const secret = randomBytes(48).toString('hex')
        await upsertVercelEnvVar(vercelToken, projectId, 'SESSION_SECRET', secret).catch(() => {})
      }
      if (!process.env.ENCRYPTION_KEY) {
        const key = randomBytes(32).toString('hex')
        await upsertVercelEnvVar(vercelToken, projectId, 'ENCRYPTION_KEY', key).catch(() => {})
      }
      await triggerVercelRedeploy(vercelToken, projectId).catch(() => {})
    }
    return NextResponse.json({ adminPath: cfg.adminPath, needsRedeploy: true })
  }

  // Auto-login the admin so the post-setup redirect lands them authenticated
  const admin = await prisma.user.findFirst({ where: { role: { isProtected: true } } })
  if (admin) {
    const token = await createSession(admin.id)
    await setSessionCookie(token)
  }

  return NextResponse.json({ adminPath: cfg.adminPath })
}
