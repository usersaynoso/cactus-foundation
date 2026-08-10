import { getSessionFromCookie } from '@/lib/auth/session'
import { headers } from 'next/headers'
import { resolveExtensionTabs } from '@/lib/modules/extension-tabs'
import { TabStrip } from '@/components/admin/TabStrip'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Inbox — Admin' }

// The Inbox is a host, not a feature: it holds whatever messaging surfaces the
// installed modules publish into `core.inbox-tabs`, so a site's enquiries and its
// live chat share one sidebar link instead of taking one each. Each tab is gated
// by its own module's permission, and the sidebar hides the link entirely when
// nothing fills it - so landing here with no tabs means a module was removed (or
// its deploy has not finished) rather than a wrong turn.
//
// Which tab is open lives in the URL rather than in client state, because the
// panels are server components that read their own query params (the contact
// inbox filters by ?status= and pages with ?page=). Client-side switching would
// leave those params describing a panel that is no longer on screen.

type Props = { searchParams: Promise<Record<string, string>> }

export default async function InboxPage({ searchParams }: Props) {
  const user = await getSessionFromCookie()
  if (!user) return null

  const tabs = await resolveExtensionTabs('core.inbox-tabs', user)

  if (tabs.length === 0) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">Inbox</h1>
        </div>
        <div className="alert alert-info">
          Nothing is using the inbox yet. Install a module that receives messages - the contact form
          or live chat - and its messages turn up here.
        </div>
      </div>
    )
  }

  const sp = await searchParams
  // An unknown ?tab= (a stale bookmark, a module since removed) falls back to the
  // first tab rather than an empty screen.
  const active = tabs.find((t) => t.id === sp.tab) ?? tabs[0]
  if (!active) return null // unreachable - the empty case returned above
  const adminPath = (await headers()).get('x-cactus-admin-path') ?? ''

  return (
    <div>
      {tabs.length > 1 && (
        <TabStrip
          style={{ marginBottom: '1.5rem' }}
          items={tabs.map((t) => ({
            key: t.id,
            label: t.label,
            href: `/${adminPath}/inbox?tab=${encodeURIComponent(t.id)}`,
            active: t.id === active.id,
          }))}
        />
      )}
      <active.Component searchParams={sp} />
    </div>
  )
}
