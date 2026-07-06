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
// auto-scales an <svg> child to fill it (Blocks/Outline use lucide icons). A plain text glyph
// doesn't stretch the same way, so it reads smaller than the built-in tabs unless we fill the
// box ourselves and size the glyph up to match the icons' visual weight.
export function tabIcon(glyph: string) {
  return (
    <span
      aria-hidden
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', fontSize: '1.4em', lineHeight: 1 }}
    >
      {glyph}
    </span>
  )
}
