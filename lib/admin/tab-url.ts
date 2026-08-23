/**
 * Keep an admin page's open tab in the URL.
 *
 * Every tabbed admin screen holds its tab in React state, which is fine until the
 * page is refreshed, bookmarked or shared - all of which used to dump the admin
 * back on the first tab. Writing the choice into the query string fixes that
 * without changing how the tabs themselves work.
 *
 * replaceState rather than a router navigation, for two reasons: this is
 * bookkeeping about where you already are, so the back button should leave the
 * page rather than walk back through every tab that got poked at; and a router
 * call would re-run the server page for a view the client is already showing.
 */
export function setUrlParams(
  params: Record<string, string | null>,
  opts: { dropHash?: boolean } = {},
) {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  // Deep links carry a #section hash, which has already done its scrolling by the
  // time anyone clicks a tab. Leaving it behind re-scrolls the new tab.
  if (opts.dropHash) url.hash = ''
  for (const [key, value] of Object.entries(params)) {
    if (value === null) url.searchParams.delete(key)
    else url.searchParams.set(key, value)
  }
  if (url.href !== window.location.href) window.history.replaceState(null, '', url)
}
