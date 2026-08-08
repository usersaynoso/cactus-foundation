import { connection } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { IconLinkBlock, type IconLinkProps } from './IconLinkBlock'

// Server (RSC) half of Icon Link. Split from the block itself because the
// 'Admins only' audience gate reads the admin session cookie via
// @/lib/auth/session (next/headers + Prisma) — server-only, which must stay out
// of the client editor bundle. Same shape as shop's ShopCartSummary.rsc gate.
//
// 'everyone' (the default) never touches the cookie, so ordinary pages stay
// cacheable; only an admin-gated instance opts its render into per-request
// work via connection().
export async function IconLinkRsc(props: IconLinkProps) {
  if (props.audience === 'admin') {
    await connection()
    const admin = await getSessionFromCookie()
    if (!admin) return null
  }
  return <IconLinkBlock {...props} />
}
