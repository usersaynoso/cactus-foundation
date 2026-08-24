// Shape of a BorderField's stored value, plus the one bit of arithmetic the
// render paths need from it. Plain module, no 'use client': BorderField.tsx is
// a client component, and the header block, header root and footer root all
// read this from the RSC side - importing it from there would drag an editor
// field into the server graph. Same reasoning as lib/puck/siteLogoAlign.ts.

// 'show' means "the one edge this field is about" and predates there being a
// choice of edge, so it stays the bottom border on a header and the top border
// on a footer - every layout saved before the edge picker existed renders the
// same. 'top' and 'both' only ever appear on a field that opted in via
// `sides: true`.
//
// `width` is a plain CSS length ("2px"). Blank or absent means 1px - the only
// thickness this field could draw before it existed - so every layout saved
// without one renders exactly as it did.
export type BorderFieldValue = { show: 'show' | 'hide' | 'top' | 'both'; color: string; width?: string }

/** The line thickness a stored border value asks for, defaulted. Shared so the
 *  header block, the header root and the footer root cannot drift apart on what
 *  a blank width means. */
export function borderWidthOf(value: { width?: string } | undefined): string {
  return value?.width?.trim() || '1px'
}
