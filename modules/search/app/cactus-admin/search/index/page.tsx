import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

// The search index dashboard is now a sub-tab of Settings > Search rather than a
// sidebar link of its own. This route stays put so old bookmarks still land on it.
export default async function SearchAdminRedirect() {
  const adminPath = (await headers()).get('x-cactus-admin-path') ?? 'cactus-admin'
  return redirect(`/${adminPath}/config?tab=search`)
}
