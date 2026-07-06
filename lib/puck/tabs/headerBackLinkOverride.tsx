import { useEffect, useRef, type ReactNode } from 'react'
import Link from 'next/link'

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
    useEffect(() => {
      if (ref.current) relabelPublishButton(ref.current)
    })
    return (
      <div ref={ref} style={{ position: 'relative' }}>
        {children}
        <Link href={href} className="cactus-puck-back-link" title={label} aria-label={label}>
          <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}>
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
          </svg>
        </Link>
      </div>
    )
  }
}
