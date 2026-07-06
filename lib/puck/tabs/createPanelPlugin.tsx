import type { ReactNode } from 'react'
import type { Plugin } from '@puckeditor/core'

// Shared shell for custom Puck left-sidebar tabs. Puck's `plugins` prop treats any
// plugin with a `label` + `render` as a new sidebar tab (blocksPlugin/outlinePlugin
// are themselves built this way) — this factory just standardises the panel chrome.
export function createPanelPlugin(opts: {
  name: string
  label: string
  icon: ReactNode
  content: ReactNode
}): Plugin {
  return {
    name: opts.name,
    label: opts.label,
    icon: opts.icon,
    render: () => (
      <div style={{ padding: '0.75rem 1rem', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
        {opts.content}
      </div>
    ),
  }
}

// Puck's sidebar icon slot (`.NavItem-linkIcon`) is a fixed 2em x 2em box whose CSS only
// auto-scales an <svg> child to fill it (`.NavItem-linkIcon svg { height:100%; width:100% }`).
// Blocks/Outline use real lucide SVGs so they fill the box; a text glyph has no intrinsic
// size that rule can hook into, so it stays small regardless of font-size. Fix: give every
// custom tab a real <svg> in lucide's own style (24x24, stroke-based) so the same CSS sizes
// it identically to the built-in tabs.
function svgIcon(paths: ReactNode) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths}
    </svg>
  )
}

export const settingsTabIcon = svgIcon(
  <>
    <circle cx={12} cy={12} r={3} />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </>
)

export const conditionsTabIcon = svgIcon(
  <>
    <circle cx={12} cy={12} r={10} />
    <circle cx={12} cy={12} r={6} />
    <circle cx={12} cy={12} r={2} />
  </>
)

export const historyTabIcon = svgIcon(
  <>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </>
)

export const savedBlocksTabIcon = svgIcon(
  <path d="M19 21 12 17 5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
)
