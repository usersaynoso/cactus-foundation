// Shared contract for any Puck block (core or module) that wants a "shrunk"
// variant of one of its own fields when placed in a header with "Shrink on
// scroll" enabled. Convention only, nothing to register:
// - gate the extra field's visibility in that component's own resolveFields
//   with isHeaderShrinkEnabled(appState)
// - swap the rendered value via a scoped <style> override targeting
//   HEADER_SHRUNK_SELECTOR, same pattern GridBlock already uses for its
//   responsive breakpoint overrides
export function isHeaderShrinkEnabled(appState: any): boolean {
  return appState?.data?.root?.props?.shrinkOnScroll === 'yes'
}

export const HEADER_SHRUNK_SELECTOR = 'header[data-shrink-root][data-shrunk]'
