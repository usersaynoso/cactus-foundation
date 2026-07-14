/** Admin routes where the Puck editor takes over the whole viewport.
 *
 * The shell treats these specially: no content padding, no document scroll, and
 * the sidebar collapses to a rail, because Puck's canvas and panels are full
 * height and do their own scrolling.
 *
 * Everything else keeps the ordinary padded, scrolling admin chrome - including
 * the /new routes that sit under the same path prefixes. Those are not editors:
 * /pages/new is a title-and-slug form and /layouts/new is the starter-template
 * picker, and stripping their padding and scrollbar makes the picker unusable
 * (its cards run to the window edge and the ones below the fold are unreachable).
 */
const PUCK_EDITOR_RE = /\/(?:pages|layouts)\/(?!new$)[^/]+$|\/appearance\/(?:header|footer)$/

export function isPuckEditorRoute(pathname: string): boolean {
  return PUCK_EDITOR_RE.test(pathname)
}
