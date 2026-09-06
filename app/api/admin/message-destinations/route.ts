import { NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermissions } from '@/lib/permissions/check'
import { resolveMessageDestinations } from '@/lib/conversations/destinations'

// The places a message collected on the public side can be delivered to, for
// whoever is building the page that collects it.
//
// A page-builder field is the only thing that asks: a block that gathers
// enquiries offers this list, stores the id it is given and never looks inside
// it again. So the gate is the two grants that let somebody edit a page or a
// layout in the first place - there is no separate "may see the list of
// mailboxes" grant to invent, and an editor who cannot open the builder has
// nothing to do with the answer.
//
// Names no module at either end: what comes back is whatever the site's
// installed modules publish at `core.message-destinations`, and an empty list
// on a site with none is a correct answer rather than a failure.

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const held = await hasPermissions(user, ['pages.write', 'layouts.manage'])
  if (!held['pages.write'] && !held['layouts.manage']) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const groups = await resolveMessageDestinations()
  return NextResponse.json({ groups }, { headers: { 'Cache-Control': 'no-store' } })
}
