import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { syncToEdgeConfig } from '@/lib/config/edge-config'

export async function POST() {
  const cfg = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { adminPath: true, setupCompleted: true },
  })

  if (cfg?.setupCompleted) {
    const userCount = await prisma.user.count()
    if (userCount > 0) {
      return NextResponse.json({ error: 'Setup is already complete' }, { status: 403 })
    }
  }

  if (!cfg?.adminPath) {
    return NextResponse.json({ error: 'Admin path not set' }, { status: 400 })
  }

  // Seed the default theme (Prickly)
  const existingTheme = await prisma.theme.findFirst()
  if (!existingTheme) {
    await prisma.theme.create({
      data: {
        name: 'Prickly',
        version: '1.0.0',
        isActive: true,
      },
    })
  }

  await prisma.siteConfig.update({
    where: { id: 'singleton' },
    data: {
      setupCompleted: true,
      status: 'comingSoon',
      hideFromCrawlers: true,
    },
  })

  // Mirror to Edge Config (non-fatal if credentials absent)
  await syncToEdgeConfig({
    adminPath: cfg.adminPath,
    siteStatus: 'comingSoon',
  }).catch(() => {})

  return NextResponse.json({ adminPath: cfg.adminPath })
}
