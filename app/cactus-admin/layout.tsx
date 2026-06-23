import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getSessionFromCookie } from '@/lib/auth/session'
import { prisma } from '@/lib/db/prisma'
import AdminNav from '@/components/admin/AdminNav'
import EnvBanner from '@/components/admin/EnvBanner'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers()
  const adminPath = headersList.get('x-cactus-admin-path') ?? ''

  // Login page bypasses auth — render it without the admin shell to avoid
  // an infinite redirect loop (layout redirecting to login, which is itself).
  const isLoginPage = headersList.get('x-cactus-is-login') === '1'
  if (isLoginPage) {
    return <>{children}</>
  }

  // Secondary session check — proxy.ts is the primary gate, but server components
  // independently validate so a bypass of proxy.ts headers never opens the UI.
  const user = await getSessionFromCookie()
  if (!user) {
    redirect(`/${adminPath}/login`)
  }

  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { siteName: true },
  })

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/cactus.svg" alt="Cactus" style={{ width: 28, height: 28, background: '#fff', borderRadius: 4, padding: 2, flexShrink: 0 }} />
          {config?.siteName ?? 'Cactus'}
        </div>
        <AdminNav adminPath={adminPath} userRole={user.role} />
      </aside>
      <div className="admin-main">
        <EnvBanner />
        <div className="admin-content">
          {children}
        </div>
      </div>
    </div>
  )
}
