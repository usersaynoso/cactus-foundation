import { connection } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { ThemeToggleBlock, type ThemeToggleBlockProps } from './ThemeToggleBlock'

// Server (RSC) half of Theme Toggle. Split from the block itself because the
// audience gate reads the admin session cookie via @/lib/auth/session
// (next/headers + Prisma) — server-only, which must stay out of the client
// editor bundle. Same shape as IconLinkRsc.
//
// The test is `!== 'everyone'`, not `=== 'admin'`, and that is deliberate: this
// block existed long before the field did, so every toggle already placed on a
// site carries no `audience` prop at all. Reading a missing value as 'admin'
// makes the setting's promise ("admins only until you say otherwise") true for
// those blocks too, rather than depending on Puck filling defaultProps into
// saved data. A site that wants the toggle public sets the field to Everyone,
// which is stored and reads as public from then on.
//
// Only the public arm is free: 'everyone' never touches the cookie, so ordinary
// pages stay cacheable, while a gated toggle opts its render into per-request
// work via connection().
export async function ThemeToggleRsc(props: ThemeToggleBlockProps) {
  if (props.audience !== 'everyone') {
    await connection()
    const admin = await getSessionFromCookie()
    if (!admin) return null
  }
  return <ThemeToggleBlock {...props} />
}
