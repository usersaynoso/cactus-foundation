// Runs once when a server instance starts, before it serves a request.
//
// Loads the database half of the encryption keyring (previous keys, the active
// key's fingerprint, the stable id salt) so the synchronous encrypt / decrypt /
// sign / verify helpers in lib/crypto/keyring.ts have it from the first request.
// Bounded, so a slow database delays boot by seconds rather than indefinitely;
// the keyring refreshes itself later either way.
//
// The import sits INSIDE the NEXT_RUNTIME check, never after an early return.
// Webpack compiles this file for the edge runtime too, and only drops a branch
// it can see is dead: with `if (!== 'nodejs') return` first, it still bundled
// the keyring for edge, could not resolve Node's 'crypto', and the dev server
// refused to build at all.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startKeyring } = await import('@/lib/crypto/keyring-loader')
    await Promise.race([startKeyring(), new Promise<void>((resolve) => setTimeout(resolve, 5000))])
  }
}
