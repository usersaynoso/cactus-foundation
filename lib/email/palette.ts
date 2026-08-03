import { DEFAULT_DESIGN_TOKENS, type DesignTokens } from '@/lib/design/tokens'

// Design tokens flattened to the two lookups an email can actually use. Kept
// apart from lib/email/wrapper.ts because the layout editor (a client
// component) needs the same mapping, and wrapper.ts reaches for Prisma.

export type EmailPalette = { colours: Record<string, string>; fonts: Record<string, string> }

/** Design-token ids to their light-mode values. Email has no dark mode worth
 * the name - client support is a coin toss, and half of what does support it
 * inverts colours on its own - so the light value is the one that ships. */
export function paletteFromTokens(raw: unknown): EmailPalette {
  const tokens = (raw ?? DEFAULT_DESIGN_TOKENS) as DesignTokens
  const ds = tokens?.designSystem ?? DEFAULT_DESIGN_TOKENS.designSystem
  const colours: Record<string, string> = {}
  for (const c of ds?.colours ?? []) {
    if (c?.id && typeof c.light === 'string') colours[c.id] = c.light
  }
  const fonts: Record<string, string> = {}
  for (const f of ds?.fonts ?? []) {
    if (f?.id && typeof f.family === 'string') fonts[f.id] = f.family
  }
  return { colours, fonts }
}
