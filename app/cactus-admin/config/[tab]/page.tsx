import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

// /<admin>/config/<tab> is the Settings page opened on that tab - the same place as
// /<admin>/config?tab=<tab>, which is where every tab, core's and every module's,
// actually lives. Lets a tab be linked to by a path ("Settings › Server is at
// /hq/config/server") without the page growing a second way to choose a tab.
//
// A real folder under config/ (privacy-generator) is a static route and wins over
// this one, so nothing that exists today moves.

export default async function ConfigTabRedirect({ params, searchParams }: {
  params: Promise<{ tab: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { tab } = await params
  const adminPath = (await headers()).get('x-cactus-admin-path') ?? 'cactus-admin'
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === 'string' && key !== 'tab') query.set(key, value)
  }
  query.set('tab', /^[a-z0-9][a-z0-9-]{0,60}$/i.test(tab) ? tab : 'general')
  return redirect(`/${adminPath}/config?${query}`)
}
