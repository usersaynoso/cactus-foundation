/**
 * The proxied media worker's origin, on its own and with nothing behind it.
 *
 * This lives apart from lib/media/upload.ts for one reason: what imports it.
 * `workerUrl()` reads a single environment variable and imports nothing, but it
 * used to sit in upload.ts, which pulls in sharp, @aws-sdk/client-s3, the glTF
 * optimiser (draco3d, @gltf-transform) and jsdom through lib/sanitize. Anything
 * wanting the worker's address therefore dragged the entire media toolchain into
 * its bundle - including lib/media/asset-token.ts, which signs the media URLs on
 * every public page.
 *
 * That is invisible in dev and in `tsc`: the types are fine, the code runs, and
 * the only symptom is on the deploy, where the file tracer copies those packages
 * into every function that can reach them and Vercel then hashes and uploads the
 * result. Measured on a real build of this site, sharp and its libvips binary
 * alone accounted for 2 GB of written function payload across 130 functions.
 *
 * So: a leaf module, no imports, and upload.ts re-exports it so every existing
 * caller keeps working unchanged. Anything that only needs the address should
 * import it from here.
 */

export function workerUrl(): string {
  // trim() before anything else: a stray trailing space or newline in the env
  // value (Vercel keeps whatever was pasted, invisible ones included) survives
  // into `${workerUrl()}/${key}`, putting a space in the MIDDLE of every upload
  // PUT target and stored serving url - which the browser rejects outright as a
  // "bad URL" before it even sends the request. Every other reader of this value
  // (the CSP host, the image-loader allowlist) runs it through `new URL().origin`,
  // which trims for them, so the fault hides everywhere except the raw string
  // concatenation here. Strip surrounding whitespace and any trailing slashes.
  return process.env.CLOUDFLARE_WORKER_URL?.trim().replace(/\/+$/, '') ?? ''
}
