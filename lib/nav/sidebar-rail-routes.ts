import { isPuckEditorRoute } from '@/lib/puck/editor-routes'

/** Admin routes that drop the sidebar to a rail while they are open.
 *
 * Two kinds qualify: the Puck editors (their canvas and panels want the whole
 * viewport) and the Inbox, which is a three-column mail reader - folder list,
 * thread list, message - and loses a column to the expanded sidebar on a laptop.
 *
 * The admin path is configurable, so match on the tail of the route only. The
 * Inbox is a core host screen, so this stays true of any site: whichever module
 * fills the inbox tabs, the screen underneath is the same one.
 */
const RAIL_ROUTE_RE = /\/inbox$/

/** The Inbox host screen, whichever module is filling its tabs. Exported in its
 *  own right because the screen wants two things from the shell, not one: the
 *  sidebar down to a rail, and less air around the content than an ordinary
 *  admin page - a mail reader is a full-height three-column thing, and a
 *  two-centimetre margin round it is two centimetres off the message. */
export function isInboxRoute(pathname: string): boolean {
  return RAIL_ROUTE_RE.test(pathname)
}

export function isSidebarRailRoute(pathname: string): boolean {
  return isPuckEditorRoute(pathname) || isInboxRoute(pathname)
}
