import { createContext, useContext, useEffect, useRef, type MouseEvent, type ReactNode } from 'react'
import Link from 'next/link'

// Context, not a prop baked in at createBackLinkOverride-call time: the override
// factory only runs inside a useMemo (backHref/label rarely change), so if
// hasUnsavedChanges were a plain argument instead, the memo would need it in its
// deps - and it flips false->true exactly once (the first real edit), which
// recreated the whole overrides object and made Puck reinitialise mid-edit
// (lost focus/scroll on whatever field was being typed into). Reading it via
// context inside BackLinkOverride's own render lets the caller's memo stay
// stable while this component still sees the live value on every render.
const UnsavedChangesContext = createContext(false)
export const UnsavedChangesProvider = UnsavedChangesContext.Provider

// Puck hardcodes the button label as "Publish" with no override hook for the text itself
// (only for surrounding markup). We already wrap the header in a wrapper here for the
// back-link overlay, so piggyback on that to relabel the button post-render — page status
// is already Draft/Published in the settings tab, so "Publish" on this button is confusing.
function relabelPublishButton(root: HTMLElement) {
  const walk = (node: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim() === 'Publish') {
        child.textContent = 'Update'
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        walk(child)
      }
    })
  }
  walk(root)
}

// Puck's own header reserves a blank gutter to the left of its title (matching the
// pluginbar's width) on desktop — see `_PuckHeader` padding-left in @puckeditor/core's
// CSS. Puck renders that gutter empty; we overlay our own back link into it via
// `overrides.header` rather than keeping a separate topbar strip above the whole editor.
// Below Puck's own 638px breakpoint the gutter doesn't exist (see .cactus-puck-back-link
// in sidebarOverrides.css), so this only shows on desktop widths.
export function createBackLinkOverride(href: string, label: string) {
  return function BackLinkOverride({ children }: { children: ReactNode }) {
    const ref = useRef<HTMLDivElement>(null)
    const hasUnsavedChanges = useContext(UnsavedChangesContext)
    useEffect(() => {
      if (ref.current) relabelPublishButton(ref.current)
    })
    // Content only saves on an explicit Update click now (no background autosave),
    // so leaving via this link - a client-side <Link> nav, which beforeunload can't
    // intercept - needs its own confirm before it discards in-progress edits.
    const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
      if (hasUnsavedChanges && !confirm('You have unsaved changes. Leave without clicking Update?')) {
        e.preventDefault()
      }
    }
    return (
      <div ref={ref} style={{ position: 'relative' }}>
        {children}
        <Link href={href} className="cactus-puck-back-link" title={label} aria-label={label} onClick={handleClick}>
          <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}>
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
          </svg>
        </Link>
      </div>
    )
  }
}
