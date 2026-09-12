import { Render } from '@puckeditor/core/rsc'
import type { Data, Config } from '@puckeditor/core'
import { getPuckRenderMetadata } from '@/lib/puck/renderMetadata'

// Puck's `Render`, with the site-wide values every block expects already attached.
//
// THE BUG THIS EXISTS TO MAKE IMPOSSIBLE: Puck hands blocks their site-wide values
// through a `metadata` prop on `Render`, and a `Render` without one hands every block
// inside it nothing. Core's renderInfoPage has always passed it. Every module that
// renders a layout of its own had its own `<Render>` - 59 of them on public paths -
// and not one passed it. So three settings silently did nothing on those pages:
//
//   - `lazyImages`, the owner's "load images only when they're needed" switch
//   - `loadedFonts`, which is what stops a block asking Google for a typeface the
//     page has already fetched
//   - `imageResizing`, which is why the responsive-images switch appeared to do
//     nothing on a product page while working perfectly on the homepage
//
// None of them failed loudly. Each simply behaved as though the owner had never
// touched the setting, on some pages and not others.
//
// Passing metadata by hand at 59 call sites fixes it once; this fixes it for good,
// because the next site somebody adds gets the values by default and the next value
// somebody adds reaches every site without a sweep. There is a test asserting no
// public module render uses Puck's bare `Render` - see CactusRender.test.ts.
//
// Async and server-only, which is the whole trick: the CALLER needs no await and no
// local variable, so adopting it is a one-word change even in a synchronous server
// component. getPuckRenderMetadata is cache()d, so the several Render calls one page
// makes (header, content, footer, a product's description) share a single query.
//
// Not for documents. A printed invoice or purchase order wants its pictures EAGER
// and full-size - lazy loading and a resized source are both wrong when the renderer
// is a headless browser taking one snapshot - so those keep Puck's `Render` directly
// and deliberately. Nor for client components, which cannot reach the database at
// all; those take what they need as a prop from whatever rendered them.
export async function CactusRender({
  config,
  data,
}: {
  // As loose as Puck's own signature. Every caller already casts - the configs are
  // assembled from generated module registries - so tightening it here would only
  // move a cast rather than remove one.
  config: Config
  data: Data
}) {
  return <Render config={config} data={data} metadata={await getPuckRenderMetadata()} />
}
