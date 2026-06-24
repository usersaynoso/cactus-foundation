import { headers } from 'next/headers'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import type { Metadata } from 'next'
import TemplatesClient from './TemplatesClient'

export const metadata: Metadata = { title: 'Templates — Admin' }

export default async function TemplatesPage() {
  const headersList = await headers()
  const adminPath = headersList.get('x-cactus-admin-path') ?? ''
  const user = await getSessionFromCookie()
  const canManage = user ? await hasPermission(user, 'templates.manage') : false

  if (!canManage) {
    return <div style={{ padding: '2rem', color: '#6b7280' }}>You do not have permission to manage templates.</div>
  }

  const [templates, config] = await Promise.all([
    prisma.pageTemplate.findMany({ orderBy: { updatedAt: 'desc' } }),
    prisma.siteConfig.findUnique({ where: { id: 'singleton' }, select: { headerTemplateId: true, footerTemplateId: true } }),
  ])

  return (
    <TemplatesClient
      templates={templates.map((t) => ({ ...t, updatedAt: t.updatedAt.toISOString() }))}
      adminPath={adminPath}
      headerTemplateId={config?.headerTemplateId ?? null}
      footerTemplateId={config?.footerTemplateId ?? null}
    />
  )
}
