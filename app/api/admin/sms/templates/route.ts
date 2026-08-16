import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { groupSmsTemplates, listSmsTemplates, MAX_SMS_TEMPLATE_LENGTH } from '@/lib/sms/registry'
import { getInstalledModuleNames } from '@/lib/layout/installed-layout-types'
import { isSmsAvailable } from '@/lib/sms/send'

// Every text message this site can send, grouped by the module that declared
// it, with the admin's edits already overlaid. The email twin of this route is
// app/api/admin/emails/templates/route.ts, and the two are deliberately alike.

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await hasPermission(user, 'sms.templates'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [overrides, installed, smsAvailable] = await Promise.all([
    prisma.smsTemplate.findMany(),
    getInstalledModuleNames(),
    isSmsAvailable(),
  ])
  const overridesByKey = new Map(overrides.map((o) => [o.key, o]))

  // The build clones every module in modules.json, so the registry knows about
  // messages from modules this site has never installed. Listing those would
  // offer an owner the chance to carefully reword a text nothing sends.
  const visible = listSmsTemplates().filter((t) => installed.has(t.source))

  const groups = groupSmsTemplates(visible).map((group) => ({
    groupLabel: group.groupLabel,
    source: group.source,
    templates: group.templates.map((def) => {
      const override = overridesByKey.get(def.key)
      return {
        key: def.key,
        label: def.label,
        mergeTags: def.mergeTags,
        requiredTags: def.requiredTags ?? [],
        transactional: def.transactional,
        body: override?.body ?? def.body,
        defaultBody: def.body,
        isActive: override?.isActive ?? true,
        isOverridden: !!override?.body,
        updatedAt: override?.updatedAt ?? null,
      }
    }),
  }))

  return NextResponse.json({ groups, smsAvailable, maxLength: MAX_SMS_TEMPLATE_LENGTH })
}
