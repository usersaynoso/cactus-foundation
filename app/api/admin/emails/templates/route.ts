import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { emailOverrideValue, groupEmailTemplates, listEmailTemplates } from '@/lib/email/registry'
import { getInstalledModuleNames } from '@/lib/layout/installed-layout-types'

// Every email this site can send, grouped by where it came from, with the
// admin's edits already overlaid - plus the wrapper designs available to point
// them at.

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await hasPermission(user, 'emails.templates'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [overrides, installed, wrappers] = await Promise.all([
    prisma.emailTemplate.findMany(),
    getInstalledModuleNames(),
    prisma.layout.findMany({
      where: { type: 'emailWrapper' },
      select: { id: true, name: true, status: true, priority: true, updatedAt: true },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
    }),
  ])
  const overridesByKey = new Map(overrides.map((o) => [o.key, o]))

  // The build clones every module in modules.json, so the registry knows about
  // emails from modules this site has never installed. Listing those would
  // offer an owner the chance to carefully reword an email nothing sends.
  const visible = listEmailTemplates().filter((t) => t.source === 'core' || installed.has(t.source))

  const groups = groupEmailTemplates(visible).map((group) => ({
    groupLabel: group.groupLabel,
    source: group.source,
    templates: group.templates.map((def) => {
      const override = overridesByKey.get(def.key)
      // A stored copy identical to the default is not an edit, whatever put it
      // there, so the badge and the reset button go by what the copy says
      // rather than by whether a row happens to exist.
      const subjectOverride = emailOverrideValue(override?.subject, def.subject)
      const bodyOverride = emailOverrideValue(override?.bodyHtml, def.bodyHtml)
      return {
        key: def.key,
        label: def.label,
        mergeTags: def.mergeTags,
        requiredTags: def.requiredTags ?? [],
        transactional: def.transactional,
        subject: subjectOverride ?? def.subject,
        bodyHtml: bodyOverride ?? def.bodyHtml,
        defaultSubject: def.subject,
        defaultBodyHtml: def.bodyHtml,
        wrapperLayoutId: override?.wrapperLayoutId ?? null,
        isActive: override?.isActive ?? true,
        isOverridden: !!(subjectOverride || bodyOverride),
        updatedAt: override?.updatedAt ?? null,
      }
    }),
  }))

  // The first published wrapper is the one an email with no explicit choice
  // gets, so the list marks it rather than making an owner infer it from the
  // priority column.
  const publishedIds = wrappers.filter((w) => w.status === 'published').map((w) => w.id)

  return NextResponse.json({
    groups,
    wrappers: wrappers.map((w) => ({
      id: w.id,
      name: w.name,
      status: w.status,
      isDefault: w.id === publishedIds[0],
    })),
    defaultWrapperId: publishedIds[0] ?? null,
  })
}
