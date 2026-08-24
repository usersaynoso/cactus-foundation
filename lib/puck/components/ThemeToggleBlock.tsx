import React from 'react'
import { ThemeToggle as ThemeToggleClient, type ThemeToggleStyle } from '@/components/ThemeToggle'

// Presentational half of the Theme Toggle Puck block, split out of config.tsx
// for the same reason Icon Link is: the published render has an audience gate
// that reads the admin session cookie (server-only), and config.tsx is imported
// by the client editors. Both halves render THIS component, so the editor canvas
// and the published page cannot drift.

export type ThemeToggleBlockProps = {
  style?: ThemeToggleStyle
  iconSize?: number
  iconColour?: string
  hoverColour?: string
  variant?: 'default' | 'bordered' | 'filled' | 'plain'
  bgColour?: string
  borderColour?: string
  borderRadius?: number
  // See ThemeToggleRsc for how this is read. Keep the key as `audience`, never
  // `visibility` — core owns a responsive-visibility field of that exact name on
  // every block and strips it from render props, which would disable the gate.
  audience?: string
}

export function ThemeToggleBlock({
  style, iconSize, iconColour, hoverColour, variant, bgColour, borderColour, borderRadius,
}: ThemeToggleBlockProps) {
  return (
    <ThemeToggleClient
      style={style}
      appearance={{ iconSize, iconColour, hoverColour, variant, bgColour, borderColour, borderRadius }}
    />
  )
}
