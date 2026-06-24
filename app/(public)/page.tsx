import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'

export const dynamic = 'force-dynamic'

// Root page: forward to setup if not complete, otherwise serve the site homepage.
export default async function RootPage() {
  let setupCompleted = false
  try {
    const cfg = await prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: { setupCompleted: true },
    })
    setupCompleted = cfg?.setupCompleted ?? false
  } catch {
    setupCompleted = false
  }

  if (!setupCompleted) {
    redirect('/setup')
  }

  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { siteName: true, tagline: true, description: true },
  })

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '4rem 1.5rem' }}>
      <h1>{config?.siteName ?? 'Welcome'}</h1>
      {config?.tagline && <p style={{ fontSize: '1.25rem', color: '#6b7280' }}>{config.tagline}</p>}
      {config?.description && <p>{config.description}</p>}
    </div>
  )
}
