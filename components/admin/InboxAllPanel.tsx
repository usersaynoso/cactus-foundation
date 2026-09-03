import { headers } from 'next/headers'
import { getSessionFromCookie } from '@/lib/auth/session'
import { resolveConversationProviders } from '@/lib/conversations/providers'
import { formatInSiteTimezone } from '@/lib/config/timezone'
import { getSiteTimezone } from '@/lib/config/timezone.server'
import type { ConversationChannel, ConversationSummary } from '@/lib/conversations/types'

// Core's own Inbox tab: every channel the installed modules publish, in one
// list, newest first. Deliberately small - it is a courtesy view, not a product.
// Reading only: replying happens on the owning module's own tab, one click away
// down the link in each row. A site that wants a real merged inbox installs a
// module that consumes the same providers, and then this tab stands down.

const ROWS = 50

const CHANNEL_LABELS: Record<ConversationChannel, string> = {
  email: 'Email',
  chat: 'Live chat',
  form: 'Form',
  phone: 'Phone',
  sms: 'Text',
}

type Row = ConversationSummary & { moduleName: string }

// A module's link is relative to the admin root, because only the page knows
// what this site calls that. Anything trying to be an absolute URL is dropped
// rather than followed - a provider has no business sending an admin off-site.
function tabHref(adminPath: string, href: string): string | null {
  if (!href || href.includes('://') || href.startsWith('//')) return null
  return `/${adminPath}/${href.replace(/^\/+/, '')}`
}

function participantLabel(row: Row): string {
  const { name, email, phone } = row.participant
  return name || email || phone || 'Unknown sender'
}

export async function InboxAllPanel() {
  const user = await getSessionFromCookie()
  if (!user) return null

  const providers = await resolveConversationProviders(user)
  const adminPath = (await headers()).get('x-cactus-admin-path') ?? ''
  const timezone = await getSiteTimezone()

  // One module's provider failing (an API down, a table not migrated yet) must
  // cost that channel and not the whole page.
  const pages = await Promise.all(
    providers.map(async ({ moduleName, provider }) => {
      try {
        const page = await provider.list({ limit: ROWS })
        return page.items.map((item) => ({ ...item, moduleName }))
      } catch (err) {
        console.error(`[inbox] conversation provider "${moduleName}" could not be listed:`, err)
        return [] as Row[]
      }
    }),
  )

  const rows = pages
    .flat()
    .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
    .slice(0, ROWS)

  if (rows.length === 0) {
    return (
      <div className="alert alert-info">
        Nothing has come in yet. New messages from any channel turn up here.
      </div>
    )
  }

  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>From</th>
            <th>Channel</th>
            <th>Message</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const href = tabHref(adminPath, row.href)
            const subject = row.subject || participantLabel(row)
            return (
              <tr key={`${row.moduleName}:${row.id}`}>
                <td style={{ fontWeight: row.unread ? 600 : 400 }}>
                  {href ? <a href={href}>{participantLabel(row)}</a> : participantLabel(row)}
                </td>
                <td><span className="badge badge-gray">{CHANNEL_LABELS[row.channel] ?? row.channel}</span></td>
                <td style={{ fontSize: '0.9rem' }}>
                  <div style={{ fontWeight: row.unread ? 600 : 400 }}>{subject}</div>
                  {row.preview && (
                    <div style={{ color: 'var(--color-text-muted)' }}>{row.preview}</div>
                  )}
                </td>
                <td style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                  {formatInSiteTimezone(row.lastMessageAt, timezone, {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
