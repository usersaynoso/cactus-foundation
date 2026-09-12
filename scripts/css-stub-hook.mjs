// A loader hook that answers every .css import with an empty module.
//
// Node cannot load CSS, and a terminal script that touches the media library
// reaches the module extension points, which reach Puck's stylesheet. Nothing a
// terminal script does needs a single rule out of it, so the honest answer is an
// empty module rather than a crash.
//
// Paired with the `_extensions['.css']` stub in the runner that registers this:
// that one covers require(), this one covers import. Which fires depends on how
// far down the graph the stylesheet sits, so both are needed.

export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith('.css')) {
    return { url: new URL('data:text/javascript,export default {}').href, shortCircuit: true }
  }
  return nextResolve(specifier, context)
}
