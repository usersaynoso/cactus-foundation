// Runs once when a server instance starts, before it serves a request.
//
// Loads the database half of the encryption keyring (previous keys, the active
// key's fingerprint, the stable id salt) so the synchronous encrypt / decrypt /
// sign / verify helpers in lib/crypto/keyring.ts have it from the first request.
// Bounded, so a slow database delays boot by seconds rather than indefinitely;
// the keyring refreshes itself later either way.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { startKeyring } = await import('@/lib/crypto/keyring-loader')
  await Promise.race([startKeyring(), new Promise<void>((resolve) => setTimeout(resolve, 5000))])
}
