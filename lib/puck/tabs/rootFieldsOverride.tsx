import type { ReactNode } from 'react'

// Puck falls back to a built-in `{ title: text }` root field whenever a config's
// `root.fields` is left undefined (see @puckeditor/core's `defaultPageFields`). Neither
// puckConfig (pages) nor layoutPuckConfig (layouts) define root fields, so with nothing
// selected the right sidebar shows a "Page" panel duplicating the Title/Name field our
// own Settings tab already owns. Puck always renders that panel's breadcrumb header
// regardless, but the field body can be swapped via the `fields` override - hide it
// whenever nothing is selected (itemSelector is only set once a block is selected).
export function hideRootFieldsOverride({ children, itemSelector }: { children: ReactNode; itemSelector?: unknown }) {
  return <>{itemSelector ? children : null}</>
}
