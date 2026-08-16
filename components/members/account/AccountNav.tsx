'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { TabStrip } from '@/components/admin/TabStrip'
import { ACCOUNT_SECTION_DEFS, type AccountSectionKey } from '@/lib/members/account-layout'
import type { MembersConfig } from '@/lib/members/config'
import type { MemberAccountNavItem } from '@/lib/members/account-nav'

// Module tabs (Shop contributes Orders and Addresses) slot in after Security
// rather than being appended to the lot. Appended, they came after Danger Zone
// - the two tabs a member actually uses sitting past the one about deleting
// their account, which reads as an afterthought.
const SECTIONS_BEFORE_EXTRAS: AccountSectionKey[] = ['profile', 'security']

// How far down the viewport a section has to have travelled before it counts as
// the one being read: the sticky tab bar, plus a line of breathing room, plus
// whatever the site header takes when it sticks (read per frame, since a
// shrink-on-scroll header changes it as the page moves).
const SPY_OFFSET = 96

function stickyHeaderOffset(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--cactus-header-offset')
  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

type Props = {
  basePath: string
  sections: MembersConfig['accountSectionsEnabled']
  /** Tabs contributed by modules via `members.account-nav`. */
  extras?: MemberAccountNavItem[]
  /** False when no module contributes notification categories, which hides the
   * Notifications tab: core has none of its own, so the page would only ever
   * say there is nothing to choose. */
  notificationsAvailable?: boolean
  /** One-page account (`accountSinglePage`): the core tabs scroll to a section
   * of the overview instead of loading a page each. Module tabs are untouched -
   * they are whole pages of their own with their own data. */
  singlePage?: boolean
}

// Overview is the only tab matched exactly: its href is a prefix of every other
// tab's, so a prefix match would light it up everywhere. The rest match their
// own sub-tree, or a module's detail page (/shop/account/orders/<id>) would
// leave every tab unlit and the member looking at an orphan page.
function isActive(pathname: string, href: string, exact: boolean): boolean {
  if (exact) return pathname === href
  return pathname === href || pathname.startsWith(href + '/')
}

export default function AccountNav({
  basePath,
  sections,
  extras = [],
  notificationsAvailable = true,
  singlePage = false,
}: Props) {
  const pathname = usePathname()
  // Which section the member is currently looking at, in one-page mode. Null
  // means the top of the page, which is Overview's own territory.
  const [activeAnchor, setActiveAnchor] = useState<string | null>(null)

  // Only on the page that actually holds the sections. A module tab is a page
  // of its own, and lighting a core section tab there would be a lie.
  const spying = singlePage && pathname === basePath

  useEffect(() => {
    // Nothing to watch, and nothing to reset either: every read of this state
    // is already gated on `spying`, so a stale anchor left behind by a previous
    // page cannot light anything up.
    if (!spying) return
    let frame = 0
    const pick = () => {
      frame = 0
      const marker = window.scrollY + stickyHeaderOffset() + SPY_OFFSET
      let current: string | null = null
      let last: string | null = null
      for (const def of ACCOUNT_SECTION_DEFS) {
        const el = document.getElementById(def.anchor)
        if (!el) continue
        last = def.anchor
        if (el.getBoundingClientRect().top + window.scrollY <= marker) current = def.anchor
      }
      // A last section too short to ever reach the marker would otherwise never
      // light its own tab, however far the member scrolled - so once there is no
      // more page to scroll, it wins.
      if (last && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
        current = last
      }
      setActiveAnchor(current)
    }
    // First reading on the next frame rather than here and now: a member landing
    // on a hash (or restoring a scroll position) has not been scrolled yet at
    // the moment this runs, and setting state straight from an effect body is a
    // cascading render besides.
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(pick) }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [spying])

  // Scrolls rather than navigates, and only where there is something on the page
  // to scroll to. From a module tab the click is left alone: the href is a real
  // address on the overview, and letting it load is exactly right.
  const scrollToAnchor = useCallback((event: React.MouseEvent<HTMLElement>, anchor: string) => {
    if (!spying) return
    const target = document.getElementById(anchor)
    if (!target) return
    event.preventDefault()
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // The address bar keeps up without adding a history entry per tab - Back
    // should leave the account, not walk the member back up their own page.
    window.history.replaceState(null, '', `#${anchor}`)
  }, [spying])

  const scrollToTop = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (!spying) return
    event.preventDefault()
    window.scrollTo({ top: 0, behavior: 'smooth' })
    window.history.replaceState(null, '', window.location.pathname)
  }, [spying])

  const sectionItems = ACCOUNT_SECTION_DEFS.filter(
    (s) => sections[s.key] && (s.key !== 'notifications' || notificationsAvailable),
  ).map((s) => ({
    key: s.key,
    label: s.label,
    href: singlePage ? `${basePath}#${s.anchor}` : `${basePath}${s.path}`,
    active: singlePage
      ? spying && activeAnchor === s.anchor
      : isActive(pathname, `${basePath}${s.path}`, false),
    onClick: singlePage ? (e: React.MouseEvent<HTMLElement>) => scrollToAnchor(e, s.anchor) : undefined,
  }))

  // Where the module tabs go. findIndex, not a fixed count: any of the sections
  // can be switched off in settings, so the first tab that is not a
  // before-extras one is the seam wherever it lands (and -1 means every enabled
  // section belongs in front, so they go on the end).
  const firstAfter = sectionItems.findIndex((item) => !SECTIONS_BEFORE_EXTRAS.includes(item.key))
  const insertAt = firstAfter === -1 ? sectionItems.length : firstAfter

  const items = [
    {
      key: 'index',
      label: 'Overview',
      href: basePath,
      // On one page the overview is the top of the page rather than a page of
      // its own, so it lights up until the first section has been reached.
      active: singlePage ? spying && activeAnchor === null : isActive(pathname, basePath, true),
      onClick: singlePage ? scrollToTop : undefined,
    },
    ...sectionItems.slice(0, insertAt),
    ...extras.map((extra) => ({
      // Namespaced so a module cannot collide with a built-in section key.
      key: `x:${extra.key}`,
      // .badge/.badge-primary rather than inline colours: it is the house pill
      // and it is already the right way round in dark mode, where white on
      // --color-primary only reaches 3.6:1.
      label: extra.badge ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
          {extra.label}
          <span className="badge badge-primary">{extra.badge}</span>
        </span>
      ) : (
        extra.label
      ),
      href: extra.href,
      active: isActive(pathname, extra.href, false),
      onClick: undefined,
    })),
    ...sectionItems.slice(insertAt),
  ]

  // On one page the tab bar is the only way back up, and a member three
  // sections down has scrolled it off the top - so it stays put. It needs its
  // own background to do that: without one, the sections would scroll through
  // it. `--cactus-header-offset` is the site header's own height, published by
  // the header block whenever it sticks (0 when it does not), so the bar pins
  // under the header rather than behind it. Only in one-page mode; a tabbed
  // account has a bar per page and nothing long enough to scroll past it.
  return (
    <TabStrip
      items={items}
      style={
        singlePage
          ? {
              position: 'sticky',
              top: 'var(--cactus-header-offset, 0px)',
              // Under a sticky site header (z-index 100), over the page.
              zIndex: 5,
              background: 'var(--color-page-bg, var(--color-bg))',
              paddingTop: 'var(--space-2)',
            }
          : undefined
      }
    />
  )
}
