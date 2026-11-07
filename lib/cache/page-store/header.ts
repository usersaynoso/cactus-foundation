// The header on the request the page store makes of its own server. A file of its
// own because proxy.ts needs the name on every platform, including the ones where the
// engine and its node: imports are swapped out.
export const INTERNAL_RENDER_HEADER_NAME = 'x-cactus-page-store-render'
