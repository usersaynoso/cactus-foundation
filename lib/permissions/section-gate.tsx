import type { ReactNode } from 'react'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermissions } from '@/lib/permissions/check'

// The door on an admin section.
//
// The sidebar has always hidden a link a role has no business with, and every
// API behind these screens checks its own permission - but a hidden link is not
// a locked door, and several core screens would happily render for anyone signed
// in who typed the address. The server components among them (Pages, Media) went
// further and queried the data before rendering it. Each section now says who it
// is for, in one place that also covers its nested routes.
//
// Any-of, not all-of: a role holding any one of the listed keys has business
// here, and each screen still gates its individual actions on its own key.
export async function denyUnlessAny(keys: string[], what: string): Promise<ReactNode | null> {
  const user = await getSessionFromCookie()
  // The admin layout has already bounced an unauthenticated request to the login
  // page; belt and braces for a segment rendered outside it.
  if (!user) return <div className="alert alert-danger">You must be signed in to view this.</div>
  const granted = await hasPermissions(user, keys)
  if (keys.some((k) => granted[k] === true)) return null
  return <div className="alert alert-danger">You do not have permission to {what}.</div>
}
